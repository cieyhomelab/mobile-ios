# BYOK (User-Entered API Keys) Implementation Plan

## Overview

Remove the two build-time secrets (`EXPO_PUBLIC_ELEVENLABS_API_KEY`, `EXPO_PUBLIC_ANTHROPIC_API_KEY`) and the voice-ID env var from the app, and replace them with a Settings screen where the user pastes in their own ElevenLabs and Anthropic keys, stored in the iOS Keychain via `expo-secure-store`. After this change, the app ships with no key baked into the binary — the user must enter their own keys before any voice feature works.

## Current State Analysis

All three secrets flow through a single choke point, `src/lib/voice-config.ts`, which reads `process.env.EXPO_PUBLIC_*` once at module load and exports resolved consts. Three modules import those consts directly at module scope: `voice-stt.ts` (ElevenLabs key), `voice-tts.ts` (ElevenLabs key + voice ID), and `event-parser.ts` (Anthropic key, two call sites — create-event parsing and delete-target parsing). `.env.local` holds the live secret values and is gitignored; there is no `.env.example`.

There is no existing secure-storage precedent in this codebase — `expo-secure-store` isn't installed. The one existing "store a credential" flow, `google-calendar-auth.ts`, delegates entirely to the native Google Sign-In SDK's own keychain handling and never touches `expo-secure-store`/`AsyncStorage` directly. There is also no modal or stack-navigation precedent — the app's only navigation is two flat tabs (`index`, `explore`) registered via `expo-router`'s `NativeTabs` in `src/components/app-tabs.tsx` / `app-tabs.web.tsx`.

`src/app/index.tsx` is an 858-line screen driven by a 12-state `ScreenPhase` machine. Errors from the pipeline are currently caught generically and rendered as plain text via a `pipelineError` string in `HomeView` — there's no "actionable banner with a button" pattern yet, though the shape (a message rendered below the action tiles) is there to extend.

### Key Discoveries:

- `src/lib/voice-config.ts:1-11` is the single source of truth for all three secrets — deleting it and its three consumers' imports is the entire surface of "removing the build-time keys."
- `src/lib/voice-stt.ts:22`, `src/lib/voice-tts.ts:14,17`, `src/lib/event-parser.ts:76,127` are the only four call sites that read a secret; each reads a top-level const, not `process.env` directly.
- `src/hooks/use-google-calendar-session.ts` is the closest existing pattern for a new "status" hook: a state union, a mount-effect bootstrap, and a `DEBUG_FORCE_*` escape hatch (which this plan intentionally does not replicate — see What We're NOT Doing).
- `src/app/index.tsx:202-238` already gates its top-level render on `session.state`; the BYOK gate needs to slot into that same conditional chain without firing during the `loading` branch (see Critical Implementation Details).
- `assets/images/tabIcons/` holds only `home.png`/`explore.png` at 1x/2x/3x — `NativeTabs.Trigger.Icon` in this codebase uses bundled images, not the `expo-symbols` SF Symbols used elsewhere in `index.tsx` (see Critical Implementation Details).
- The current hardcoded `EXPO_PUBLIC_ELEVENLABS_VOICE_ID` value (`21m00Tcm4TlvDq8ikWAM`) is ElevenLabs' public premade "Rachel" voice, not a private voice from one account's library — safe to ship as a suggested default once the field becomes user-editable.
- Test conventions (`voice-stt.test.ts`, `google-calendar-api.test.ts`, `event-parser.test.ts`): colocated `*.test.ts`, `global.fetch` stubbed fresh per test via `beforeEach`, native modules mocked with `jest.mock('module-name', () => ({ ... }))`, custom error classes asserted via `.rejects.toThrow(ErrorClass)`.

## Desired End State

After installing from the App Store, a user with no keys configured lands on the Settings tab immediately (not the voice Home screen), sees a short explanation of why two keys are needed and where to get them, and can paste in an ElevenLabs key, an optional voice ID, and an Anthropic key — each validated against the provider before being saved. Once both required keys are present, the app unlocks the Home screen and the full voice pipeline (record → transcribe → parse → confirm → create/delete, plus "what's on today") works end-to-end using only the user's own keys. Removing a key from Settings immediately locks the corresponding feature again, surfaced via an inline banner with a button back to Settings. A release build's JS bundle contains zero occurrences of any key pattern.

## What We're NOT Doing

- No component-level test files for `settings.tsx` or the `index.tsx` changes — this repo has no existing convention for screen/component tests; coverage stays at the `secure-keys.ts` lib layer plus manual device verification.
- No dev-mode fallback to `.env.local` — removed everywhere, including development builds, so dev and production behavior can never diverge.
- No in-app ElevenLabs voice-library browser/picker — the voice ID field is plain text, not a searchable picker UI.
- No `DEBUG_FORCE_*`-style bypass for the BYOK gate (unlike `use-google-calendar-session.ts`'s `DEBUG_FORCE_SIGNED_IN`) — not requested, and it would undercut the point of manually verifying the gate works.
- No `.env.example` file — none exists today and this change is about removing env-var usage, not documenting it.
- No data migration — the app isn't shipped yet, so there are no existing installs to migrate.

## Implementation Approach

Six phases, each independently shippable and testable: build the storage/validation foundation first (no UI, fully unit-testable), wire it into the three existing pipeline modules (still no UI), then build the Settings screen, then wire the gating/error UX into the existing voice screen, then clean up the repo's remaining references, and finally verify the release binary is actually clean. This ordering means every phase after the first can be manually verified against a real, working (if partial) app rather than scaffolding in isolation.

## Critical Implementation Details

### Tab icon: verify SF Symbol support before adding a raster asset

The two existing tabs (`home`, `explore`) register their `NativeTabs.Trigger.Icon` with a bundled PNG (`src` prop) at three densities, even though `index.tsx` itself uses `expo-symbols`' `SymbolView` freely for in-screen icons. Per this repo's own `AGENTS.md` directive ("Expo HAS CHANGED — read the exact versioned docs before writing any code"), check the installed `expo-router` v57 docs for whether `NativeTabs.Trigger.Icon` also accepts an SF Symbol name on iOS before defaulting to designing and exporting a new three-density `settings.png`. If SF Symbol support exists, prefer it — it avoids an asset-design step entirely and keeps the icon crisp at any scale.

### Startup gate ordering: BYOK check fires only after Google sign-in

`VoiceScreen`'s render is currently gated purely on `session.state` (`loading` / `signedOut` / `signedIn`), and `OnboardingView` (shown when `signedOut`) is the very first thing a new user sees, asking them to connect Google Calendar. The BYOK redirect must fire only once `session.state === 'signedIn'` — never during `loading` (or it'll flash the wrong screen on every cold start) and never before the user has connected their calendar (or the user is asked for two unrelated things — calendar access and API keys — at the same moment, which the change spec's own "first impression" concern is trying to avoid). Sign-in-to-calendar, then discover-you-need-keys is the intended order.

## Phase 1: Secure key storage & validation

### Overview

Build the storage and validation foundation with no UI dependency, so it's fully covered by unit tests before anything touches the screen layer.

### Changes Required:

#### 1. Install `expo-secure-store`

**File**: `package.json`

**Intent**: Add the native Keychain-backed storage module all three secrets will live in.

**Contract**: Run `npx expo install expo-secure-store`; adds the SDK-57-compatible version to `dependencies`.

#### 2. Key storage & validation module

**File**: `src/lib/secure-keys.ts` (new)

**Intent**: Single module owning storage for all three BYOK values (ElevenLabs key, ElevenLabs voice ID, Anthropic key) and validation of the two API keys against their providers, so every other module has one place to read from.

**Contract**: Exports `getElevenLabsKey`/`saveElevenLabsKey`/`clearElevenLabsKey`/`hasElevenLabsKey`; `getElevenLabsVoiceId`/`saveElevenLabsVoiceId`/`clearElevenLabsVoiceId`; `getAnthropicKey`/`saveAnthropicKey`/`clearAnthropicKey`/`hasAnthropicKey`; `hasRequiredKeys(): Promise<boolean>` (true only when both the ElevenLabs key and the Anthropic key are present — the voice ID is excluded since it has a safe default). Each `save*` call uses `SecureStore.setItemAsync(name, value.trim(), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })` under its own item name. `getElevenLabsVoiceId()` returns a module-level `DEFAULT_ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'` constant when nothing has been saved yet.

Also exports `validateElevenLabsKey(apiKey): Promise<{ valid: true; planName: string } | { valid: false; error: string }>` — `GET https://api.elevenlabs.io/v1/user` with `xi-api-key` header; 401 → invalid; other non-ok → provider error with status; network failure → `'Could not reach ElevenLabs'`; on success, `planName` comes from `data.subscription?.tier ?? 'unknown'`.

And `validateAnthropicKey(apiKey): Promise<{ valid: true } | { valid: false; error: string }>` — `POST https://api.anthropic.com/v1/messages` with `model: 'claude-haiku-4-5'`, `max_tokens: 1`; 401 → invalid; **400 is also treated as valid** (auth passed, only the deliberately-sparse body was rejected — this is the one non-obvious branch in this module); other non-ok → provider error; network failure → `'Could not reach Anthropic'`.

#### 3. Tests

**File**: `src/lib/secure-keys.test.ts` (new)

**Intent**: Cover save/get/clear/has for all three stored values and both validators against success, 401, provider-error, and network-error cases.

**Contract**: `jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))`, matching how `voice-stt.test.ts` mocks `expo-file-system`; `global.fetch` stubbed fresh per test as in `google-calendar-api.test.ts`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test -- secure-keys.test.ts`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

---

## Phase 2: Wire storage into the pipeline

### Overview

Swap the three call sites from module-level env-backed consts to per-call reads from `secure-keys.ts`, and remove `voice-config.ts` entirely.

### Changes Required:

#### 1. `voice-stt.ts`

**File**: `src/lib/voice-stt.ts`

**Intent**: Read the ElevenLabs key at call time instead of at module load, so a key the user just removed or changed takes effect immediately without an app restart.

**Contract**: At the top of `transcribeAudio`, `const apiKey = await getElevenLabsKey(); if (!apiKey) throw new Error('MISSING_ELEVENLABS_KEY');` before building the request; the fetch header uses this local `apiKey` instead of the removed top-level import.

#### 2. `voice-tts.ts`

**File**: `src/lib/voice-tts.ts`

**Intent**: Same swap, for both the API key and the voice ID.

**Contract**: `const apiKey = await getElevenLabsKey(); if (!apiKey) throw new Error('MISSING_ELEVENLABS_KEY'); const voiceId = await getElevenLabsVoiceId();` — the voice ID never throws, since `secure-keys.ts` already falls back to the default.

#### 3. `event-parser.ts`

**File**: `src/lib/event-parser.ts`

**Intent**: Same swap in both `parseDeleteTargetFromTranscript` and `parseEventFromTranscript`, each reading the key independently at call time.

**Contract**: Same `const apiKey = await getAnthropicKey(); if (!apiKey) throw new Error('MISSING_ANTHROPIC_KEY');` guard at the top of each function, before its `fetch` call; header uses the local `apiKey`.

#### 4. Remove the old config module

**File**: `src/lib/voice-config.ts` (deleted)

**Intent**: Nothing imports from it once the three call sites above are updated.

**Contract**: File removed; no remaining `@/lib/voice-config` imports anywhere in `src/`.

#### 5. Update existing tests

**File**: `src/lib/voice-stt.test.ts`, `src/lib/event-parser.test.ts` (and `voice-tts.test.ts` if present)

**Intent**: Mock `secure-keys.ts`'s getters instead of relying on `voice-config`'s placeholder consts, and add a case per module asserting the `MISSING_*_KEY` error is thrown when the getter resolves `null`.

**Contract**: `jest.mock('@/lib/secure-keys', () => ({ getElevenLabsKey: jest.fn(), getElevenLabsVoiceId: jest.fn(), getAnthropicKey: jest.fn() }))`, matching the existing native-module mocking pattern.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- No remaining references: `grep -r "voice-config" src/` returns nothing

---

## Phase 3: Settings screen + navigation

### Overview

Add the third tab and the Settings screen itself — the first user-facing surface of this change.

### Changes Required:

#### 1. Tab icon asset

**File**: `assets/images/tabIcons/settings.png` (+ `@2x`/`@3x`), or none if SF Symbol support applies

**Intent**: Match the existing two tabs' icon convention (see Critical Implementation Details for the SF-Symbol-vs-PNG check to do first).

**Contract**: If PNG: same pixel dimensions as `home.png`/`explore.png` at each density, gearshape glyph, `renderingMode="template"` compatible (single-color/alpha).

#### 2. Register the third tab

**File**: `src/components/app-tabs.tsx`, `src/components/app-tabs.web.tsx`

**Intent**: Add the Settings tab alongside Home and Explore.

**Contract**: A third `<NativeTabs.Trigger name="settings">` with `Label` "Settings" and an `Icon`, mirroring the existing two triggers exactly (native file); equivalent addition in the web variant.

#### 3. Settings screen

**File**: `src/app/settings.tsx` (new)

**Intent**: The BYOK entry screen — three fields (ElevenLabs API key, ElevenLabs voice ID, Anthropic API key), each independently saved/validated/removed, styled with `VoiceColors` matching `index.tsx`'s existing card/button conventions (`OnboardingView`/`HomeView` precedent). Includes an inline explainer panel — shown only while neither required key is saved yet — covering why two keys are needed and where to get them, satisfying the first-run explainer without introducing a separate route. Includes links to each provider's key-management page.

**Contract**: On mount, reads current status via `hasElevenLabsKey()`/`hasAnthropicKey()`/`getElevenLabsVoiceId()`. For each of the two validated fields, "Save" first calls the matching `validate*Key`; only on `{ valid: true }` does it call the matching `save*Key` and update the status line ("Connected — plan: Creator" for ElevenLabs, "Connected" for Anthropic); on `{ valid: false }` it shows the returned `error` and does not save. "Remove key" calls the matching `clear*`. The voice ID field has no validation call (no lightweight endpoint exists) — Save persists it directly, or clears back to the default when emptied. Provider links use `WebBrowser.openBrowserAsync(url)` to `https://elevenlabs.io/app/settings/api-keys`, `https://elevenlabs.io/app/voice-library`, and `https://console.anthropic.com/settings/keys`, matching `external-link.tsx`'s existing usage of `expo-web-browser`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Entering an invalid key shows the provider's error inline and does not save the key
- Entering a valid key shows "Connected" (with plan name for ElevenLabs) and persists across app restart
- "Remove key" reverts the status line to "Not connected"
- The voice ID field saves a custom value and defaults to the Rachel voice ID when left blank
- All three provider links open the correct page in the in-app browser

---

## Phase 4: First-launch gating & missing-key UX

### Overview

Wire the storage layer into the existing voice screen: redirect to Settings when required keys are missing, and replace the generic error text with an actionable banner when a pipeline call fails due to a missing key.

### Changes Required:

#### 1. BYOK status hook

**File**: `src/hooks/use-byok-status.ts` (new)

**Intent**: Mirror `use-google-calendar-session.ts`'s shape (state union + mount-effect bootstrap) so `index.tsx` can gate on it the same way it already gates on `session.state`.

**Contract**: Exports `useByokStatus(): { state: 'checking' | 'ready' | 'missing' }`, backed by a mount effect calling `hasRequiredKeys()` from `secure-keys.ts`.

#### 2. Wire the gate and the banner into the voice screen

**File**: `src/app/index.tsx`

**Intent**: (a) Redirect to the Settings tab once the BYOK check resolves to `'missing'`, but only after `session.state === 'signedIn'` (see Critical Implementation Details for why). (b) Catch `MISSING_ELEVENLABS_KEY`/`MISSING_ANTHROPIC_KEY` errors from the existing pipeline call sites (`handlePressOut`, `handleDeletePressOut`, `handleReadToday`) into a dedicated `missingKeyProvider` state instead of the generic `pipelineError` string, so `HomeView` can render an actionable banner in that case instead of plain text.

**Contract**: Import `router` from `expo-router`; add `const byok = useByokStatus()` and a `useEffect` that calls `router.replace('/settings')` when `session.state === 'signedIn' && byok.state === 'missing'`. In each of the three catch blocks, add a branch checking `err instanceof Error && (err.message === 'MISSING_ELEVENLABS_KEY' || err.message === 'MISSING_ANTHROPIC_KEY')` that sets `missingKeyProvider` (`'elevenlabs' | 'anthropic'`) instead of `pipelineError`.

#### 3. Missing-key banner component

**File**: `src/app/index.tsx` (new local component, alongside `OnboardingView`/`ActionTile`/etc.)

**Intent**: One shared banner for both providers, per the change spec.

**Contract**: `MissingApiKeyBanner({ provider: 'elevenlabs' | 'anthropic' })` renders "Add your [ElevenLabs/Anthropic] key in Settings" with a button calling `router.navigate('/settings')`; rendered in `HomeView` wherever `pipelineError`/`resultMessage` currently render, gated on `missingKeyProvider !== null`, taking precedence over the plain error text.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Unit tests pass: `npm test`

#### Manual Verification:

- Fresh install with no keys saved and Google Calendar already connected → app opens straight to Settings, not the voice Home screen
- After saving both required keys and relaunching, the app opens to Home normally
- Removing only the Anthropic key, returning to Home, and attempting to create an event by voice shows the Anthropic banner (not a generic error string) with a working "Go to Settings" button
- Removing only the ElevenLabs key and attempting to record or read today's events shows the ElevenLabs banner

---

## Phase 5: Repo cleanup

### Overview

Remove the now-dead env-var references from local config and documentation, and add a guardrail note for future changes.

### Changes Required:

#### 1. `.env.local`

**File**: `.env.local`

**Intent**: Remove the three `EXPO_PUBLIC_*` lines now that nothing reads them.

**Contract**: Delete the `EXPO_PUBLIC_ELEVENLABS_API_KEY`, `EXPO_PUBLIC_ANTHROPIC_API_KEY`, and `EXPO_PUBLIC_ELEVENLABS_VOICE_ID` lines; if the file is empty afterward, delete it entirely.

#### 2. `README.md`

**File**: `README.md`

**Intent**: Replace the "paste your key into `.env.local`" setup instructions with "enter your keys inside the app, under the Settings tab."

**Contract**: Rewrite the setup-instructions block (the one currently listing the three `EXPO_PUBLIC_*` lines with provider dashboard URLs as comments) to describe the in-app flow instead; the provider URLs move into this description as plain links.

#### 3. `CLAUDE.md`

**File**: `CLAUDE.md`

**Intent**: Guard against regression — a future change (human or agent) should not reintroduce these secrets as build-time env vars.

**Contract**: Add one bullet noting that ElevenLabs/Anthropic keys are BYOK, stored via `src/lib/secure-keys.ts`, and must never be reintroduced via `.env.local`/`app.json`/`EXPO_PUBLIC_*`.

### Success Criteria:

#### Automated Verification:

- No remaining references outside this change's own historical spec: `git grep -n "EXPO_PUBLIC_ELEVENLABS_API_KEY\|EXPO_PUBLIC_ANTHROPIC_API_KEY\|EXPO_PUBLIC_ELEVENLABS_VOICE_ID" -- . ':!context/changes/voice-byok/change.md'` returns nothing

#### Manual Verification:

- README's setup instructions read correctly end-to-end for a new contributor with no prior context

---

## Phase 6: Release-build verification (gated)

### Overview

Prove the actual goal of this change — that a shipped binary contains no key — rather than assuming the source-level cleanup was sufficient.

### Changes Required:

None — this phase is verification-only, no source changes.

### Success Criteria:

#### Automated Verification:

- N/A (this phase is manual by nature — building and inspecting a release binary isn't part of the CI-run test/lint/typecheck suite)

#### Manual Verification:

- `npx expo prebuild --clean` followed by a fresh `npx expo run:ios --device <id> --port <free-port>` (no `--binary` reuse, per this repo's own documented gotcha about stale baked-in bundler hosts) completes and the app runs
- A release-configuration build produces an `.ipa`/archive
- `unzip` the `.ipa` and `grep -r "sk-ant\|xi-api\|EXPO_PUBLIC_ELEVENLABS\|EXPO_PUBLIC_ANTHROPIC" Payload/` returns zero matches
- On-device smoke test on the release build: fresh install with no keys saved redirects to Settings; entering real keys unlocks Home; the full create-event, delete-event, and read-today voice flows work end-to-end; removing a key locks the corresponding feature and shows the correct banner

---

## Testing Strategy

### Unit Tests:

- `secure-keys.test.ts`: save/get/clear/has for all three stored values; `validateElevenLabsKey` against 200/401/other-non-ok/network-error; `validateAnthropicKey` against 200/400/401/other-non-ok/network-error
- `voice-stt.test.ts`, `voice-tts.test.ts`, `event-parser.test.ts`: updated to mock `secure-keys.ts` getters; new case per module asserting `MISSING_*_KEY` is thrown when the getter resolves `null`

### Integration Tests:

- None — this repo has no integration-test layer; end-to-end coverage is the Phase 3/4/6 manual verification steps.

### Manual Testing Steps:

1. On a clean simulator/device with no keys saved, connect Google Calendar, then confirm the app redirects to Settings instead of showing the voice Home screen.
2. Enter a deliberately wrong ElevenLabs key; confirm the inline error and that nothing is persisted.
3. Enter a real ElevenLabs key and a real Anthropic key; confirm both show "Connected" and the app now opens to Home on relaunch.
4. Run the full create-event and delete-event voice flows end-to-end using the user-entered keys.
5. Remove the ElevenLabs key from Settings, return to Home, and confirm the mic/read-today actions show the ElevenLabs missing-key banner rather than a generic error.
6. Repeat with the Anthropic key and the create-event voice flow.
7. Build a release `.ipa` and grep the unzipped bundle for key patterns (Phase 6).

## Performance Considerations

Each pipeline call now does one extra `SecureStore.getItemAsync` read (and, on Settings' Save action, one extra validation network round-trip) compared to the previous module-level const read — negligible relative to the STT/TTS/Claude network calls already in the same code path.

## Migration Notes

Not applicable — the app has no shipped installs yet, so there's no existing user data to migrate.

## References

- Source spec: `context/changes/voice-byok/change.md`
- Central secret choke point being replaced: `src/lib/voice-config.ts:1-11`
- Pipeline call sites: `src/lib/voice-stt.ts:22`, `src/lib/voice-tts.ts:14,17`, `src/lib/event-parser.ts:76,127`
- Status-hook precedent: `src/hooks/use-google-calendar-session.ts`
- Voice screen state machine: `src/app/index.tsx:29-42,202-238`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Secure key storage & validation

#### Automated

- [x] 1.1 Unit tests pass: `npm test -- secure-keys.test.ts` — 60fcc4b
- [x] 1.2 Type checking passes: `npx tsc --noEmit` — 60fcc4b
- [x] 1.3 Linting passes: `npm run lint` — 60fcc4b

### Phase 2: Wire storage into the pipeline

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — d376d1e
- [x] 2.2 Type checking passes: `npx tsc --noEmit` — d376d1e
- [x] 2.3 Linting passes: `npm run lint` — d376d1e
- [x] 2.4 No remaining references: `grep -r "voice-config" src/` returns nothing — d376d1e

### Phase 3: Settings screen + navigation

#### Automated

- [x] 3.1 Type checking passes: `npx tsc --noEmit` — bde081b
- [x] 3.2 Linting passes: `npm run lint` — bde081b

#### Manual

- [x] 3.3 Entering an invalid key shows the provider's error inline and does not save the key — bde081b
- [x] 3.4 Entering a valid key shows "Connected" (with plan name for ElevenLabs) and persists across app restart — bde081b
- [x] 3.5 "Remove key" reverts the status line to "Not connected" — bde081b
- [x] 3.6 The voice ID field saves a custom value and defaults to the Rachel voice ID when left blank — bde081b
- [x] 3.7 All three provider links open the correct page in the in-app browser — bde081b

### Phase 4: First-launch gating & missing-key UX

#### Automated

- [x] 4.1 Type checking passes: `npx tsc --noEmit` — f6b4726
- [x] 4.2 Linting passes: `npm run lint` — f6b4726
- [x] 4.3 Unit tests pass: `npm test` — f6b4726

#### Manual

- [x] 4.4 Fresh install with no keys saved and Google Calendar already connected redirects straight to Settings — f6b4726
- [x] 4.5 After saving both required keys and relaunching, the app opens to Home normally — f6b4726
- [x] 4.6 Removing only the Anthropic key and attempting to create an event by voice shows the Anthropic banner with a working "Go to Settings" button — f6b4726
- [x] 4.7 Removing only the ElevenLabs key and attempting to record or read today's events shows the ElevenLabs banner — f6b4726

### Phase 5: Repo cleanup

#### Automated

- [x] 5.1 No remaining references outside the historical spec: `git grep -n "EXPO_PUBLIC_ELEVENLABS_API_KEY\|EXPO_PUBLIC_ANTHROPIC_API_KEY\|EXPO_PUBLIC_ELEVENLABS_VOICE_ID" -- . ':!context/changes/voice-byok/'` returns nothing (adapted exclusion to cover the whole change folder — see phase notes) — 1611c6c

#### Manual

- [x] 5.2 README's setup instructions read correctly end-to-end for a new contributor — 1611c6c

### Phase 6: Release-build verification (gated)

#### Manual

- [x] 6.1 Fresh `expo prebuild --clean` + `expo run:ios` completes and the app runs
- [x] 6.2 A release-configuration build produces an `.ipa`/archive
- [x] 6.3 `grep` of the unzipped `.ipa`'s `Payload/` for key patterns returns zero matches
- [x] 6.4 On-device smoke test on the release build: redirect, unlock, full voice flows, and key-removal lock all behave correctly
