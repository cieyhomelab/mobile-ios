# Google Calendar OAuth Sign-in Implementation Plan

## Overview

One-time Google OAuth sign-in (iOS only) scoped to Google Calendar events, via `@react-native-google-signin/google-signin`. This is Foundation F-01 from `context/foundation/roadmap.md` — it unlocks every downstream voice flow (create/read/delete events) by giving the app an access token it can use against the Google Calendar REST API. No voice/UI work happens here; verification is a minimal, throwaway screen that signs in and lists upcoming events.

## Current State Analysis

- Fresh Expo Router (SDK 57) scaffold — `src/app/{_layout,index,explore}.tsx`, no auth code, no Google/Calendar integration, no native config plugins beyond `expo-router` and `expo-splash-screen`.
- `package.json` has no auth-related dependencies.
- `app.json` has no `ios.bundleIdentifier` and no `plugins` entry beyond the two above; its top-level `scheme: "bootstrapscaffold"` is irrelevant here — `@react-native-google-signin/google-signin` uses its own `iosUrlScheme` mechanism, not the app-level deep-link scheme.
- `src/app/index.tsx` is the Home tab (see `src/components/app-tabs.tsx`) — default "Welcome to Expo" content, nothing else in the app depends on it, safe to replace.
- No test infrastructure exists (`package.json` has no test script) — verification for this Foundation is manual only.

## Desired End State

Launch the app on a physical iOS device or simulator via a local dev client. On first launch, the Home tab shows a "Connect Google Calendar" button. Tapping it opens Google's native sign-in flow scoped to `calendar.events`. On success, the screen fetches and lists the next few events from the signed-in user's primary calendar, proving the access token actually works against the Calendar API. On a subsequent launch with a valid session, the screen skips the button and silently re-authenticates, going straight to the event list. If the Calendar API ever returns 401 (access revoked), the local session is cleared and the connect button reappears.

Verify by: cold-launching the dev client, completing sign-in, confirming real calendar events render, force-quitting and relaunching to confirm silent sign-in works, and revoking access at myaccount.google.com to confirm the app falls back to the connect screen instead of a stuck error.

### Key Discoveries:

- Expo's own docs steer away from generic `expo-auth-session` for Google specifically and recommend a provider library instead (docs.expo.dev/versions/v57.0.0/sdk/auth-session/).
- `@react-native-google-signin/google-signin` requires native code — it cannot run in Expo Go; it needs a config plugin plus `expo prebuild` + `expo run:ios` (react-native-google-signin.github.io/docs/setting-up/expo).
- `GoogleSignin.getTokens()` auto-refreshes on iOS — no manual refresh-token logic is needed for the platform we're targeting.
- Google Calendar's `events.list` endpoint needs `timeMin`, `singleEvents: true`, `orderBy: "startTime"`, and a Bearer access token (developers.google.com/calendar/api/v3/reference/events/list).
- A local dev client build (`expo run:ios`) is separate from EAS cloud builds / App Store submission — it doesn't conflict with the roadmap's decision to park EAS/App Store distribution for MVP.

## What We're NOT Doing

- Android support — iOS only for MVP; Android OAuth client + SHA-1 fingerprint setup is deferred.
- Full `calendar` scope (calendar/settings management) — scope is `calendar.events` only.
- Any backend, server-side token storage, or refresh-token exchange — the native library manages the session on-device.
- Polished UI or branding for the connect screen — it's throwaway; S-01 will replace or wrap it.
- EAS cloud builds or App Store submission — local dev client only (per roadmap `## Parked`).
- Automated tests — no test infra exists yet in this scaffold; verification is manual.
- Multi-account switching UI — the native Google account picker's default behavior is used as-is.
- Renaming the app/bundle beyond what's needed for the OAuth client (`app.json`'s `name`/`slug` scaffold placeholders are left as-is).

## Implementation Approach

Two phases: first get the native module in place and the app buildable outside Expo Go (Phase 1 — config plus one manual Google Cloud Console step plus a local build), then wire the actual auth flow, connect screen, and Calendar API verification call (Phase 2). Splitting this way gives Phase 1 a clean, isolated success criterion — "the app still runs, now with the native module linked" — instead of debugging a broken native build and broken auth logic at the same time.

## Critical Implementation Details

### Timing & lifecycle

`GoogleSignin.configure({ scopes, iosClientId, webClientId })` must run exactly once, before any other `GoogleSignin` call (including the silent-sign-in check on launch). Call it at module load time in the dedicated auth module, not inside a component body, which could re-run it on every re-render.

### State sequencing

A 401 from the Calendar API can mean the access token expired (rare on iOS, since `getTokens()` already refreshes) or that the user revoked access server-side via myaccount.google.com — the native SDK's local session doesn't know about server-side revocation until an API call actually fails. On a 401: call `GoogleSignin.signOut()` first to clear the stale local session, *then* show the connect screen. Showing the connect screen without clearing the session first would let the next silent-sign-in attempt immediately reuse the same invalid session and loop back into another 401.

## Phase 1: Native module setup & Google Cloud Console configuration

### Overview

Get `@react-native-google-signin/google-signin` installed, configured, and linked into a local iOS dev client, with a real OAuth client ID from Google Cloud Console. No auth logic yet — success here is "the app still boots on-device with the native module present."

### Changes Required:

#### 1. Google Cloud Console (manual, external — not a code change)

**Intent**: Create the OAuth 2.0 credentials this Foundation depends on, in "Testing" publishing status so no Google verification review is required for a single personal user.

**Contract**:
- Create (or reuse) a Google Cloud project, enable the Google Calendar API, and configure the OAuth consent screen as **Testing** (not Production), adding `maciej.kulesza@gmail.com` as a test user.
- Create an **OAuth 2.0 Client ID** of type **iOS**, using the bundle identifier from change #2 below (`com.mkulesza.voiceassistant`).
- Create a second OAuth 2.0 Client ID of type **Web application** (no redirect URIs needed) — `@react-native-google-signin/google-signin` requires a `webClientId` even on an iOS-only setup, to mint an `idToken`.
- Record both client IDs; they're consumed as literal values in change #3 (`iosUrlScheme`, derived from the iOS client ID) and Phase 2 change #1 (`iosClientId` / `webClientId` in `GoogleSignin.configure()`).

#### 2. `app.json` — bundle identifier

**File**: `app.json`

**Intent**: Google's iOS OAuth client type is tied to a bundle identifier; the scaffold doesn't have one yet.

**Contract**: Add `"bundleIdentifier": "com.mkulesza.voiceassistant"` under the existing `"ios"` object.

#### 3. `app.json` — config plugin

**File**: `app.json`

**Intent**: Register the native module's config plugin so `expo prebuild` generates the correct native iOS project wiring for the OAuth redirect.

**Contract**: Add `["@react-native-google-signin/google-signin", { "iosUrlScheme": "<reversed iOS client ID, e.g. com.googleusercontent.apps.XXXX>" }]` to the existing `"plugins"` array, alongside `expo-router` and `expo-splash-screen`.

#### 4. `package.json` — dependency

**File**: `package.json`

**Intent**: Add the native Google Sign-In library.

**Contract**: Add `"@react-native-google-signin/google-signin"` to `"dependencies"` at its latest version compatible with Expo SDK 57 / React Native 0.86, then run `npm install`.

#### 5. Local dev client build

**Intent**: Generate the native iOS project and build it so the app can actually run with the new native module — this replaces Expo Go for the rest of this Foundation and everything downstream.

**Contract**: Run `npx expo prebuild --clean` followed by `npx expo run:ios`. This produces an `ios/` directory (native project) and installs the dev client on a simulator or connected device.

### Success Criteria:

#### Automated Verification:

- Dependency installs cleanly: `npm install`
- Type checking passes: `npx tsc --noEmit`
- `expo prebuild --clean` completes without error

#### Manual Verification:

- Google Cloud Console shows an iOS OAuth client and a Web OAuth client, consent screen in Testing status with `maciej.kulesza@gmail.com` as a test user
- `npx expo run:ios` builds and launches the app on a simulator or device, still showing the existing (unmodified) Home tab content
- No crash or red-screen error on launch — confirms the native module linked correctly even before any auth code calls it

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Auth flow, connect screen, and Calendar API verification

### Overview

Implement the actual sign-in flow: configure the library with the `calendar.events` scope, attempt silent sign-in on launch, replace the Home tab with a minimal connect screen, and verify the resulting access token against a real Calendar API call.

### Changes Required:

#### 1. Auth module

**File**: `src/lib/google-calendar-auth.ts` (new)

**Intent**: Centralize `GoogleSignin` configuration and expose a small set of functions the connect screen (and later the create/read/delete voice slices) can call without touching the library directly: configure-once-at-load, silent sign-in, explicit sign-in, sign-out, and "get a usable access token."

**Contract**: Exports `configureGoogleAuth()` (called once at module load — see Critical Implementation Details), `signInSilently(): Promise<boolean>`, `signInInteractively(): Promise<{ accessToken: string } | { error: string }>`, `getAccessToken(): Promise<string | null>`, and `signOutLocally(): Promise<void>`. `GoogleSignin.configure()` is called with `scopes: ['https://www.googleapis.com/auth/calendar.events']` plus the `iosClientId` and `webClientId` recorded in Phase 1.

#### 2. Calendar API client

**File**: `src/lib/google-calendar-api.ts` (new)

**Intent**: Thin wrapper around the Calendar `events.list` REST call, reusable by this Foundation's verification screen and by the downstream voice slices.

**Contract**: Exports `listUpcomingEvents(accessToken: string, maxResults = 5): Promise<{ id: string; summary: string; start: string }[]>`, calling `GET https://www.googleapis.com/calendar/v3/calendars/primary/events` with `timeMin` set to now, `singleEvents=true`, `orderBy=startTime`, `maxResults`, and an `Authorization: Bearer <accessToken>` header. Throws on a non-2xx response so the caller can distinguish a 401 (revoked access) from other failures.

#### 3. Connect screen

**File**: `src/app/index.tsx`

**Intent**: Replace the default "Welcome to Expo" Home tab content with the Foundation's throwaway verification UI: a connect button when signed out, an event list when signed in, and an inline error message on sign-in failure.

**Contract**: On mount, call `configureGoogleAuth()` then `signInSilently()`; if it succeeds, call `getAccessToken()` → `listUpcomingEvents()` and render the results. If silent sign-in fails, render a "Connect Google Calendar" button that calls `signInInteractively()` on tap; on success, fetch and render events the same way; on cancellation or scope denial, render an inline error message ("Calendar access is required") and leave the button visible for retry. Wrap the `listUpcomingEvents()` call in a catch that checks for a 401: on 401, call `signOutLocally()` and reset the screen back to the signed-out (button) state.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Cold-launching the dev client with no prior session shows the connect button
- Tapping it opens Google's native sign-in UI, and after granting `calendar.events` access, the screen shows real upcoming events from the signed-in Google account's primary calendar
- Force-quitting and relaunching the app skips the button and goes straight to the event list (silent sign-in works)
- Cancelling the Google sign-in sheet (or denying calendar access specifically) shows the inline error message and leaves the connect button tappable again
- Manually revoking the app's access at myaccount.google.com, then retrying the Calendar fetch (or relaunching), results in the app clearing its session and showing the connect button again — not a stuck error state

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

None — no test infrastructure exists in this scaffold yet, and this Foundation's surface (native OAuth flow, real Calendar API) is not meaningfully unit-testable without mocking investment out of proportion to a 3-week MVP.

### Integration Tests:

None, for the same reason.

### Manual Testing Steps:

1. `npx expo run:ios` — confirm clean launch with connect button visible.
2. Tap connect, complete Google sign-in, confirm real events render.
3. Force-quit, relaunch — confirm silent sign-in skips straight to the event list.
4. Trigger a cancel/deny during sign-in — confirm inline error + retry works.
5. Revoke access at myaccount.google.com/permissions, retry — confirm graceful fallback to the connect screen.

## Performance Considerations

None beyond what's already covered: `getTokens()` on iOS refreshes synchronously as part of the call, so no additional caching or background-refresh logic is needed at MVP scale (single user, infrequent calendar checks).

## Migration Notes

Not applicable — no existing data or prior auth system to migrate from.

## References

- Related roadmap item: `context/foundation/roadmap.md` — F-01
- Expo Google auth guidance: https://docs.expo.dev/guides/google-authentication/
- expo-auth-session (why not used directly): https://docs.expo.dev/versions/v57.0.0/sdk/auth-session/
- Library setup: https://react-native-google-signin.github.io/docs/setting-up/expo
- Calendar API reference: https://developers.google.com/calendar/api/v3/reference/events/list

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Native module setup & Google Cloud Console configuration

#### Automated

- [x] 1.1 Dependency installs cleanly: `npm install` — 8629962
- [x] 1.2 Type checking passes: `npx tsc --noEmit` — 8629962
- [x] 1.3 `expo prebuild --clean` completes without error — 8629962

#### Manual

- [x] 1.4 Google Cloud Console shows an iOS OAuth client and a Web OAuth client, consent screen in Testing status with `maciej.kulesza@gmail.com` as a test user — 8629962
- [x] 1.5 `npx expo run:ios` builds and launches the app on a simulator or device, still showing the existing (unmodified) Home tab content — 8629962
- [x] 1.6 No crash or red-screen error on launch — 8629962

### Phase 2: Auth flow, connect screen, and Calendar API verification

#### Automated

- [x] 2.1 Type checking passes: `npx tsc --noEmit`
- [x] 2.2 Linting passes: `npm run lint`

#### Manual

- [x] 2.3 Cold-launching the dev client with no prior session shows the connect button
- [x] 2.4 Tapping it opens Google's native sign-in UI and, after granting access, the screen shows real upcoming events
- [x] 2.5 Force-quitting and relaunching skips the button and goes straight to the event list
- [x] 2.6 Cancelling/denying sign-in shows the inline error and leaves the button tappable again
- [x] 2.7 Revoking access and retrying clears the session and returns to the connect screen
