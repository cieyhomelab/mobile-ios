# Logout / Switch Google Account — Plan Brief

> Full plan: `context/changes/switch-screen/plan.md`

## What & Why

Let a signed-in user log out of Google Calendar from the home screen and
reconnect with the same or a different Google account. Today there's no way
to disconnect once signed in — the only escape is uninstalling the app or
revoking access from Google's own account settings.

## Starting Point

The sign-out plumbing already exists but is unused: `forceSignOut()`
(`use-google-calendar-session.ts:85-89`) already signs out of the Google
Sign-In library and flips session state to `signedOut`, which already makes
`index.tsx` render the onboarding "Connect Google Calendar" screen
automatically. Nothing calls it yet — the home screen header only shows a
static, non-interactive "Connected" badge.

## Desired End State

Tapping the "Connected" badge (while idle) shows a confirm dialog. Confirming
logs the user out and returns them to the onboarding screen with a clean
slate. Tapping "Connect Google Calendar" from there shows Google's account
picker — letting the user pick the same account again or a different one.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Confirmation UX | Native `Alert.alert` | Zero new components for a low-stakes, reversible action; a custom themed screen would be disproportionate effort. | Plan |
| Affordance placement | Tap the existing "Connected" badge | No new header element needed — it's already the only account-state indicator on screen. | Plan |
| Sign-out failure handling | Clear local state regardless of SDK outcome | Matches `forceSignOut`'s current no-try/catch behavior; `signOut()` is a local cache clear, rarely network-dependent. | Plan |
| In-flight state reset | Reset `phase`/`draft`/`deleteTarget`/messages to idle on logout | Prevents a stale success/error message or leftover draft from flashing when the next account signs in. | Plan |
| "Switch account" verification scope | Confirm the account picker reappears; a real second-account sign-in is optional | Doesn't block the plan on having a spare Google test account on hand. | Plan |
| Auth-library changes | None — no forced `select_account` API call | `GoogleSignin.signOut()` already clears the cached account, so the next `signIn()` shows the picker on its own. | Plan |

## Scope

**In scope:**
- Making the header badge an interactive logout trigger with a confirm step
- Resetting `VoiceScreen`'s local phase/draft/message state on logout
- Guarding the trigger so it's a no-op mid-action (any phase other than idle)

**Out of scope:**
- Any change to `google-calendar-auth.ts` or `use-google-calendar-session.ts`
- A new themed confirm screen/component or new `ScreenPhase` value
- Explicit forced-account-picker API calls
- Error-surfacing UI for a failed sign-out call
- Requiring a second real Google account to consider the plan done

## Architecture / Approach

Single-file UI change in `src/app/index.tsx`. Add a `handleLogout` callback
in `VoiceScreen` that resets local state and calls `session.forceSignOut()`;
thread an `onLogout` prop into `HomeView`; wrap the existing "Connected"
badge in a `Pressable` that shows a native `Alert.alert` confirm before
calling it; add a `logoutDisabled = phase !== 'idle'` guard mirroring the
existing `micDisabled` pattern.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Logout affordance & wiring | Tappable badge → confirm → logout → clean onboarding screen → account picker on reconnect | Manual-only verification (no unit tests for this screen); "switch account" behavior relies on Google SDK behavior, not directly testable without a second account |

**Prerequisites:** None — all dependencies (`forceSignOut`, `handleConnect`,
`OnboardingView`) already exist and are unchanged.
**Estimated effort:** Well under one session — single file, one phase.

## Open Risks & Assumptions

- Assumes `@react-native-google-signin/google-signin`'s documented behavior
  (account picker shown again after `signOut()`) holds on the installed
  version — not independently re-verified against the package source in this
  planning pass, only asserted in the supplied research findings.
- Manual verification of the full "different account" path is optional
  without a second Google test account; the picker's *appearance* is the
  hard requirement, not a completed second sign-in.

## Success Criteria (Summary)

- Tapping the badge while idle prompts a confirm dialog; Cancel is a no-op,
  Log out returns to onboarding.
- The badge is inert while any non-idle phase is active.
- After logout, reconnecting shows Google's account chooser rather than
  silently reusing the previous session.
