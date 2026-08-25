---
change_id: apple-store-submission
title: App Store submission via EAS
status: proposed
created: 2026-08-25
updated: 2026-08-25
archived_at: null
---

# Plan: App Store submission via EAS

Ship "Voice Calendar Assistant" (bundle ID `com.mkulesza.voiceassistant`) to the App
Store using EAS Build + EAS Submit. `tech-stack.md` already commits this project to
`deployment_target: appstore-via-eas`, and `app.json` carries EAS-oriented plugin/icon
config, but there is no `eas.json`, no CI workflow, and several scaffold leftovers
(placeholder app name, placeholder icon) that must be cleaned up first. This is an
iOS-only change — Android/Play Store is out of scope even though `app.json` already
carries Android config.

**Assumptions (flag before starting, confirm or correct):**
- Apple Developer Program membership is not yet active — Phase 0 assumes enrollment
  hasn't happened.
- The Expo account behind `owner: "maciej.kulesza"` in `app.json` is the one that
  should own this EAS project. `extra.eas.projectId` (`39e2fc94-9b99-4c89-9a5b-4020d9d44253`)
  is already set, meaning `eas init` (or equivalent) ran at some point — verify that
  project still exists under this account before assuming a fresh init is needed.
- The Google OAuth consent screen is currently in **Testing** mode (per the open
  question already logged in `context/foundation/roadmap.md`). This plan assumes it
  must move to **Production/verified** before public submission — see Phase 3.
- Reviewer access to BYOK providers (Anthropic, ElevenLabs) is unresolved — see the
  decision point in Phase 9. This plan assumes the pragmatic default (temporary funded
  keys handed to the reviewer) rather than blocking on it.

---

## Phase 0 — Apple Developer & App Store Connect setup

1. Enroll in the Apple Developer Program ($99/yr) if not already active.
2. Register the bundle ID `com.mkulesza.voiceassistant` in Certificates, Identifiers &
   Profiles (must match `app.json`'s `ios.bundleIdentifier` exactly).
3. Create the App Store Connect app record: platform iOS, bundle ID above, SKU,
   primary language, display name (see Phase 1 — the current `app.json` name is a
   scaffold leftover, not what should show in the App Store).
4. Check display-name availability in App Store Connect before locking it in.

## Phase 1 — Fix scaffold leftovers in `app.json`

- `expo.name` is currently `".bootstrap-scaffold"` (`app.json:3`) — a starter leftover,
  not a real app name. Replace with the real display name (e.g. "Voice Calendar
  Assistant") before any build; this is what shows under the icon on-device.
- `expo.slug` (`"bootstrap-scaffold"`) is an internal identifier only — cosmetic, can
  stay as-is or change; note either way since it affects the EAS project URL.
- No `ios.buildNumber` is set. Prefer `eas.json`'s `"appVersionSource": "remote"` so
  EAS auto-increments build numbers per submission, rather than hand-bumping.
- `assets/expo.icon` is still the **default Expo scaffold icon** (`expo-symbol` grid
  layer + default blue gradient fill, per `assets/expo.icon/icon.json`) — must be
  replaced with a real app icon before submission. This blocks Phase 7 in practice
  (Apple will reject a build carrying the stock Expo icon).
- Verify `assets/images/splash-icon.png` isn't also a leftover placeholder.

## Phase 2 — Privacy policy & App Privacy details

The app sends microphone audio to ElevenLabs (STT), transcript text to Anthropic
(intent parsing), and calendar data to Google — plus it uses Google Sign-In. Google's
API Services User Data Policy **requires** a published privacy policy for any app using
Calendar scopes; App Store Connect also requires a Privacy Policy URL for every app.
This blocks both Phase 3 (Google verification) and Phase 9 (App Store Connect listing).

1. Write and host a privacy policy (e.g. GitHub Pages from this repo) covering: what's
   collected (voice recordings, calendar events, user-entered API keys), which third
   parties receive what and why (Google, ElevenLabs, Anthropic — one sentence each),
   that keys live only in iOS Keychain via `expo-secure-store` and never transit
   anywhere except their own provider, and that the app itself retains nothing server-side
   (there is no backend).
2. Fill in App Store Connect's App Privacy questionnaire: data types collected (Audio
   Data, User Content for calendar events), linked-to-identity (no persistent account,
   so likely "not linked"), used for tracking (no).

## Phase 3 — Google OAuth consent screen: move to Production

Resolves the open question already logged in `context/foundation/roadmap.md`.
`calendar.events` is a Google "sensitive scope" — while in Testing mode, only
allow-listed test users can sign in without an "unverified app" warning. **App Store
reviewers are not on that allowlist.** If this isn't resolved first, review will
either fail at the Google sign-in step or show a scary warning screen.

1. Google Cloud Console → OAuth consent screen → add the privacy policy URL (Phase 2),
   app logo, and scope justification.
2. Submit for Google verification. Turnaround can be a few business days — start this
   in parallel with Phases 1–2, not after them, since it's the longest lead time in the
   whole plan.
3. Confirm `IOS_CLIENT_ID`/`WEB_CLIENT_ID` in `src/lib/google-calendar-auth.ts:3-4` and
   the `iosUrlScheme` plugin config in `app.json` still match the verified OAuth client
   once verification completes (no code change expected, just a check).

## Phase 4 — Pre-release code checklist

- Confirm `DEBUG_FORCE_SIGNED_IN` in `src/hooks/use-google-calendar-session.ts:25` is
  `false` at build time (currently `false` — re-verify, don't assume it stays that way).
- Grep the repo for other `TEMP DEBUG` markers and resolve them.
- Run the BYOK binary verification that `voice-byok`'s plan specified but never
  executed (`context/changes/voice-byok/plan.md`): after Phase 7's build, unzip the
  `.ipa` and grep the JS bundle for stray key patterns (`sk-ant`, `xi-api`) — confirm
  zero matches, proving no key leaked into the shipped bundle.
- `npm run lint`, `npx tsc --noEmit`, `npm test` all clean.

## Phase 5 — Install & configure EAS

1. `npm install -g eas-cli` (or use `npx eas-cli`), `eas login`.
2. `eas whoami` — confirm the logged-in account matches `owner: "maciej.kulesza"` in
   `app.json`.
3. `eas project:info` — confirm the existing `extra.eas.projectId` is still valid
   under this account; only run `eas init` if it isn't.
4. `eas build:configure` — generates `eas.json`. Scope to iOS profiles
   (`development`/`preview`/`production`) for this change; leave Android profiles out
   unless a Play Store change is opened separately (Open question 3 below).

## Phase 6 — iOS credentials

1. `eas credentials` — let EAS manage certificates/profiles: it creates or reuses an
   Apple Distribution Certificate and Provisioning Profile automatically, prompting
   for Apple Developer login inside the CLI flow.
2. Recommended: generate an App Store Connect API Key (App Store Connect → Users and
   Access → Keys) once, and let EAS use it for both build signing and `eas submit` —
   more CI-friendly than Apple ID + app-specific password, and sets up Phase 11 for
   free. The resulting `.p8` is already covered by `.gitignore`'s `*.p8` pattern —
   never commit it regardless.

## Phase 7 — Build

- `eas build --platform ios --profile production`
- Watch for failures specific to this stack's native modules: `expo-audio` (mic
  entitlement mismatch), `@react-native-google-signin/google-signin` (iOS URL scheme
  mismatch against Phase 3's verified client), `expo-secure-store` (Keychain
  entitlement). Check these first if the first build fails.

## Phase 8 — TestFlight internal test

1. `eas submit --platform ios --latest` (or an auto-submit build profile) uploads to
   App Store Connect / TestFlight.
2. Add internal testers, install via TestFlight on a **physical device** (this app
   needs native modules — `expo-audio`, `expo-symbols`, native tabs — that don't run
   under Expo Go or web), and run the full voice pipeline for real: create, read-today,
   delete, each through record → transcribe → parse → confirm → act.
3. Sign in with a Google account that was **not** on the old Testing-mode allowlist, to
   confirm Phase 3's verification actually took effect before submitting for review.

## Phase 9 — App Store Connect listing

- Screenshots at required sizes (6.7"/6.1" iPhone) — capture fresh from the TestFlight
  build, or adapt `design/screens/*.png` if they're current.
- Description, keywords, support URL, marketing URL (optional), Privacy Policy URL
  (Phase 2).
- **Decision point — BYOK + OAuth reviewer access.** The app is non-functional without
  a user-supplied Anthropic key and ElevenLabs key, and the reviewer's Google account
  won't be pre-authorized for anything beyond what Phase 3 fixes. Recommended: in the
  App Review "Notes" field, provide a demo Google account (or clear sign-in
  instructions) **and** temporary funded Anthropic + ElevenLabs API keys for the
  reviewer to paste into Settings, with a short explanation of the BYOK model so it
  doesn't read as a broken app. Revoke the temporary keys after the review resolves.
- Age rating questionnaire; export compliance — HTTPS-only networking qualifies for
  the standard exemption (answer "No" to non-exempt encryption use).

## Phase 10 — Submit for review

- Attach the TestFlight-validated build to the version and submit.
- Likely first-pass friction given this app's shape: Guideline 2.1 (reviewer blocked
  by OAuth or missing keys — mitigated by Phase 9's notes), 5.1.1 (data-collection
  disclosure mismatch against Phase 2's answers), or Google verification not yet fully
  propagated (mitigated by starting Phase 3 early).

## Phase 11 (parked, not part of this change) — CI/CD auto-submit

`tech-stack.md` records `ci_provider: github-actions`, `ci_default_flow:
auto-deploy-on-merge`. Not required for a first manual submission. Once Phases 0–10
succeed manually once, add `.github/workflows/eas-build.yml` triggering `eas build
--auto-submit` on merge to `main`, authenticated via an `EXPO_TOKEN` repo secret (or
the App Store Connect API key from Phase 6). Kept separate so the first submission
attempt stays debuggable by hand rather than through CI logs.

---

## Note — stray local install issues blocked `expo run:ios`, now fixed (2026-08-25)

Unrelated to the phases above, but logged here since it blocked local iOS builds while
working this change:

1. `$HOME` (`/Users/maciejkulesza`) had a stray, unrelated `hash.js` script plus its own
   `package.json` (`main: hash.js`), `node_modules`, and `.expo` cache — from an npm
   install run in the wrong directory at some point. Running Expo commands from `$HOME`
   instead of the project directory made Metro treat `hash.js` as the entry point,
   failing with `Unable to resolve module crypto` (Node's `crypto` isn't polyfilled in
   the RN/Metro environment). Fixed by deleting the stray files; always `cd` into the
   project before running `expo`/`npm` commands.
2. A separate fresh clone at `~/mobile-ios` had its `package.json` silently rewritten
   (uncommitted) to SDK-46-era dependency versions (`expo ~46.0.21`, `react-native
   0.69.9`, `react 18.0.0`, etc.) after running `npx expo run:ios` — likely `npx`
   resolving a stale/cached `expo` CLI instead of the project's own. The old
   prebuild-config didn't understand the new `./assets/expo.icon` Icon Composer bundle,
   producing `Invalid mimeType for image with source: ./assets/expo.icon` during
   prebuild. Fixed by resetting `package.json`/`package-lock.json` to the committed
   versions, clearing `node_modules`/`ios`/generated files, and reinstalling clean
   (`expo` now correctly resolves to `57.0.15`). Also found and removed a plaintext
   GitHub PAT in that clone's `.npmrc`, unrecognized by the user — flagged for
   revocation on GitHub.

**Takeaway:** if a stale global/npx cache is ever suspected again, prefer `npm run ios`
(or another explicit local binary invocation) over a bare `npx expo ...`.

---

## Open questions / decisions for the user

1. **Google OAuth consent mode** — this plan assumes Production/verified is now
   required (App Store review needs it). Confirm before starting Phase 3, since it has
   the longest lead time.
2. **BYOK reviewer credentials** — willing to fund temporary Anthropic + ElevenLabs API
   keys for App Review (small one-time cost, revoked after approval)? See Phase 9.
3. **Android/Play Store** — explicitly out of scope for this change even though
   `app.json` carries Android config already; confirm whether a separate change should
   cover it later.
4. **Real app icon** — the current icon is the stock Expo scaffold icon
   (`assets/expo.icon`). Is a final icon asset ready, or does design work block Phase 1?
