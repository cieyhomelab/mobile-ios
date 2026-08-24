# BYOK (User-Entered API Keys) — Plan Brief

> Full plan: `context/changes/voice-byok/plan.md`

## What & Why

Remove `EXPO_PUBLIC_ELEVENLABS_API_KEY` and `EXPO_PUBLIC_ANTHROPIC_API_KEY` (plus the ElevenLabs voice ID) from the build, and replace them with a Settings screen where the user pastes in their own keys, stored in the iOS Keychain via `expo-secure-store`. Goal: an App Store install ships with no key inside it — the user must supply their own before voice features or intent parsing work.

## Starting Point

All three secrets flow through one file, `src/lib/voice-config.ts`, read once at module load from `.env.local` and consumed by three modules (`voice-stt.ts`, `voice-tts.ts`, `event-parser.ts`). No secure-storage or modal/stack-navigation precedent exists in this codebase yet — `expo-secure-store` isn't installed, and the app's only navigation today is two flat tabs.

## Desired End State

A fresh install with no keys saved opens straight to a Settings tab explaining why two keys are needed and where to get them. Once the user pastes in a validated ElevenLabs key and Anthropic key (voice ID optional, defaults to a public ElevenLabs voice), the app unlocks and the full voice pipeline works using only their own keys. Removing a key immediately re-locks the corresponding feature with an actionable banner. A release `.ipa` contains zero occurrences of any key string.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Settings screen placement | Third tab (`NativeTabs.Trigger`) | Matches the only navigation pattern this repo already has — no new nav primitive needed. |
| ElevenLabs voice ID | User-editable field, defaults to the public "Rachel" voice | Avoids baking in a voice tied to one account's private library. |
| First-launch behavior | Force redirect to Settings once signed in to Google Calendar | Prevents the "nothing works, no idea why" first impression the source spec explicitly worries about. |
| Missing-key UX | Reactive inline banner (not a pre-flight status check) | Reuses the existing `pipelineError` state already in `index.tsx`'s phase machine. |
| Local dev fallback | None — `.env.local` reads removed everywhere | Guarantees dev and prod never diverge; matches the spec's "never put back" instruction. |
| First-run explainer | In scope, minimal — inline panel on the Settings screen itself | Addresses the "why two keys" concern without a new route or persisted "seen" flag. |
| Release-binary verification | Gated final phase (build, unzip, grep) | This is the actual proof the feature's goal was met — skipping it leaves it unverified. |
| Key save timing | Blocks on Save — validated before persisting | Guarantees the Keychain never holds a key that's known to be invalid. |

## Scope

**In scope:**
- `secure-keys.ts` storage + validation module for both API keys and the voice ID
- Swapping all four pipeline call sites off the old env-backed consts
- New Settings screen + third tab, with inline first-run explainer
- First-launch gate + missing-key banner wired into the existing voice screen
- `.env.local` / `README.md` / `CLAUDE.md` cleanup
- Release-build verification that no key leaks into the bundle

**Out of scope:**
- Component-level tests for the new screen (no existing convention in this repo)
- A voice-library picker UI (voice ID stays a plain text field)
- A `DEBUG_FORCE_*`-style bypass for the BYOK gate
- Data migration (no existing installs to migrate)

## Architecture / Approach

One new module (`secure-keys.ts`) owns all Keychain reads/writes and provider validation. The three existing pipeline modules read from it per-call instead of importing a module-level const. A new hook (`use-byok-status.ts`) mirrors the existing `use-google-calendar-session.ts` pattern to gate `index.tsx`'s render the same way session state already does. The Settings screen is the only new UI surface; everything else reuses existing state/error-rendering patterns already in `index.tsx`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Secure key storage & validation | `secure-keys.ts` + unit tests, no UI yet | None — pure logic, fully unit-tested |
| 2. Wire storage into the pipeline | Three call sites swapped, `voice-config.ts` deleted | Missed import breaks a pipeline stage silently until manual test |
| 3. Settings screen + navigation | New tab + screen, save/validate/remove for all three values | Tab icon convention (PNG vs SF Symbol) needs a docs check first |
| 4. First-launch gating & missing-key UX | Redirect + `MissingApiKeyBanner` wired into `index.tsx` | Gate ordering vs. the existing `session.state` check (see plan's Critical Implementation Details) |
| 5. Repo cleanup | `.env.local`/README/CLAUDE.md updated | Low risk — docs and config only |
| 6. Release-build verification | Confirms the actual "no key in the binary" goal | Requires a full release build + manual `.ipa` inspection |

**Prerequisites:** None beyond what's already in the repo — Google Calendar OAuth flow already works.
**Estimated effort:** ~4-6 sessions across 6 phases (Phase 6 alone requires a full release build cycle).

## Open Risks & Assumptions

- Assumes `NativeTabs.Trigger.Icon`'s SF Symbol support (or lack thereof) in the installed `expo-router` v57 is confirmed before Phase 3's icon work — see the plan's Critical Implementation Details.
- Assumes the hardcoded voice ID (`21m00Tcm4TlvDq8ikWAM`, ElevenLabs' "Rachel") is genuinely a public premade voice available to any account, not tied to this project's specific ElevenLabs account.
- Assumes `.env.local` contains only these three vars — if it holds other unrelated config, Phase 5 removes only the three lines rather than the whole file.

## Success Criteria (Summary)

- A fresh install with no keys saved cannot use any voice feature and is guided straight to Settings
- Entering valid keys unlocks the full create/delete/read-today voice flow end-to-end
- A release `.ipa`'s JS bundle contains zero occurrences of any ElevenLabs/Anthropic key pattern
