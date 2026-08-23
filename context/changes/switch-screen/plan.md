# Logout / Switch Google Account Implementation Plan

## Overview

Let a signed-in user log out of Google Calendar from the home screen, then
reconnect with the same or a different Google account. The sign-out plumbing
already exists (`forceSignOut()`); this plan adds the missing UI trigger and
the small amount of state cleanup around it.

## Current State Analysis

- `src/lib/google-calendar-auth.ts:51-53` — `signOutLocally()` calls
  `GoogleSignin.signOut()`. This clears the Google Sign-In library's cached
  account, so the next interactive sign-in shows Google's account picker
  again instead of silently reusing the previous account. No new
  auth-library call is needed to support "switch account" — it falls out of
  "log out" + "connect" for free.
- `src/hooks/use-google-calendar-session.ts:85-89` — `forceSignOut()` is
  already implemented and returned from `useGoogleCalendarSession()`: it
  calls `signOutLocally()`, clears `accessToken`, and sets `state` to
  `'signedOut'`. Nothing in this hook needs to change.
- `src/app/index.tsx:200` — when `session.state === 'signedOut'`,
  `OnboardingView` renders automatically, and its existing "Connect Google
  Calendar" button (`index.tsx:250-259`) already calls
  `session.handleConnect()`. No changes needed there either.
- `src/app/index.tsx:299-307` — the `HomeView` header currently renders a
  static, non-interactive "Connected" badge (a `View` wrapping a checkmark
  `SymbolView` and text). Nothing on screen currently calls `forceSignOut`.
- `src/app/index.tsx:268-292` — `HomeViewProps` / `HomeView` are simple
  presentation components that already receive a set of `on*` callbacks from
  `VoiceScreen` (e.g. `onMicPressIn`, `onDeletePressIn`) and a `phase`
  string used to disable controls mid-action (`micDisabled =
  phase !== 'idle' && phase !== 'recording'`, `index.tsx:294`). This plan
  follows the same prop-passing and disabled-guard pattern.
- `VoiceScreen`'s local state — `phase`, `draft`, `deleteTarget`,
  `pipelineError`, `resultMessage` (`index.tsx:49-53`) — is independent of
  `useGoogleCalendarSession`'s state. Calling `forceSignOut()` alone does not
  reset any of it.
- No `Alert` usage exists anywhere in the codebase today; the create/delete
  confirm flows use full custom in-theme screens
  (`ConfirmCreateView`/`ConfirmDeleteView`), not native dialogs. Confirmed
  with you: for this low-stakes, easily-reversible action, a native
  `Alert.alert` confirm is the right amount of effort — not a new themed
  screen.
- No test file exists for `index.tsx` (only `src/lib/*.ts` files get paired
  `*.test.ts` in this repo's convention), so verification here is
  lint/typecheck/manual, not new unit tests.

## Desired End State

From the home screen, tapping the "Connected" badge while idle prompts a
native confirm dialog. Confirming logs the user out (regardless of whether
`GoogleSignin.signOut()` succeeds or throws), resets any in-flight screen
state back to idle, and returns to `OnboardingView`. From there, tapping
"Connect Google Calendar" shows Google's account picker (not a silent
re-auth of the same account), and picking any account — the same one or a
different one — signs the user back in normally.

Verify by: tapping the badge → seeing the confirm dialog → confirming →
landing on `OnboardingView` → tapping "Connect Google Calendar" → seeing
Google's account chooser UI appear.

### Key Discoveries:

- `forceSignOut()` (`use-google-calendar-session.ts:85-89`) is already
  wired end-to-end for state — it only needs a caller.
- Google's account-picker-on-next-sign-in behavior after `signOut()` is a
  property of `@react-native-google-signin/google-signin`, not something
  this codebase implements — no new auth code required for "switch account".
- `VoiceScreen`'s own phase/draft/message state is separate from session
  state and needs its own reset on logout.

## What We're NOT Doing

- No changes to `src/lib/google-calendar-auth.ts` or
  `src/hooks/use-google-calendar-session.ts` — `forceSignOut()` already does
  what's needed.
- No new themed confirm screen/component (no `ConfirmLogoutView`, no new
  `ScreenPhase` value) — using native `Alert.alert` instead.
- No explicit `signInWithPrompt('select_account')` or similar forced-picker
  API call — relying on the existing `signOut()` → next `signIn()` shows
  picker behavior already confirmed in research.
- No try/catch error-surfacing UI for a failed `signOutLocally()` call —
  local state is cleared regardless of the outcome of the SDK call.
- No requirement to test with two real distinct Google accounts to consider
  this plan done — manual verification confirms the account picker appears;
  a second-account sign-in is optional/nice-to-have.

## Implementation Approach

Treat this as a pure UI/wiring addition on top of already-correct session
logic. Make the existing "Connected" badge the tap target (no new header
element), confirm via a native `Alert.alert`, and on confirm call both
`session.forceSignOut()` and a small local reset of `VoiceScreen`'s own
phase/draft/message state so the next sign-in starts clean. Guard the tap so
it's only active while `phase === 'idle'`, mirroring the existing
`micDisabled` pattern.

## Phase 1: Logout affordance & wiring

### Overview

Wire the header badge to a confirm-then-logout flow, with full state reset
and a guard against firing mid-action.

### Changes Required:

#### 1. Wire session logout into `VoiceScreen`

**File**: `src/app/index.tsx`

**Intent**: Add a `handleLogout` callback in `VoiceScreen` (alongside the
existing `handlePressIn`/`handleDeletePressIn`-style callbacks) that resets
all of `VoiceScreen`'s local screen state to idle and then calls
`session.forceSignOut()`, so the user lands on a clean `OnboardingView`
regardless of what phase they logged out from.

**Contract**: `handleLogout` sets `phase` to `'idle'`, `draft` to `null`,
`deleteTarget` to `null`, `pipelineError` to `null`, and `resultMessage` to
`null`, then awaits `session.forceSignOut()`. It does not need to guard on
`phase` itself (see item 3) — the reset happens unconditionally once called.

#### 2. Make the "Connected" badge an interactive logout trigger

**File**: `src/app/index.tsx`

**Intent**: Turn the current static badge (`index.tsx:304-307`) into a
`Pressable` that shows a native confirm dialog before logging out, matching
the destructive-confirm pattern already familiar from iOS system dialogs
(no in-app precedent needed since this is the first `Alert` usage).

**Contract**: Import `Alert` from `react-native`. Add an `onLogout: () =>
void` prop to `HomeViewProps` and thread it through from `VoiceScreen`'s
`handleLogout`. Wrap the badge's `View` in a `Pressable` whose `onPress`
calls `Alert.alert('Log out?', 'You can reconnect with the same or a
different Google account.', [{ text: 'Cancel', style: 'cancel' }, { text:
'Log out', style: 'destructive', onPress: onLogout }])`.

#### 3. Guard against logging out mid-action

**File**: `src/app/index.tsx`

**Intent**: Prevent the badge from triggering logout while a
recording/parsing/confirming/etc. action is in flight, mirroring the
existing `micDisabled` guard (`index.tsx:294`).

**Contract**: Add a `logoutDisabled = phase !== 'idle'` check in `HomeView`,
alongside the existing `micDisabled`/`status` derivations. Pass
`disabled={logoutDisabled}` to the badge's `Pressable` (a disabled
`Pressable` simply won't fire `onPress`, so no visual state change is
required beyond what `Pressable`'s `disabled` prop already gives).

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type checking passes: `npx tsc --noEmit`
- Existing test suite still passes: `npm test`

#### Manual Verification:

- On the signed-in home screen (idle phase), tapping the "Connected" badge
  shows a confirm dialog with Cancel and Log out options.
- Tapping Cancel dismisses the dialog and leaves the user signed in with no
  state change.
- Tapping Log out returns the user to the onboarding "Connect Google
  Calendar" screen.
- While a recording/transcribing/confirming/etc. phase is active, tapping
  the badge does nothing (no dialog appears).
- After logging out, tapping "Connect Google Calendar" shows Google's
  account chooser UI (confirms the picker reappears rather than silently
  reusing the prior session).
- (Optional, not blocking) If a second Google test account is available,
  confirm selecting it in the picker successfully signs in as that account.

**Implementation Note**: After completing this phase and all automated
verification passes, pause here for manual confirmation from the human that
the manual testing was successful before considering the change done.

---

## Testing Strategy

### Unit Tests:

- None added — `index.tsx` has no existing test file and this change is
  pure UI wiring with no new pure-logic function to unit test.

### Integration Tests:

- Not applicable — no integration test harness exists for this screen.

### Manual Testing Steps:

1. Run the app on a device/simulator (`expo run:ios --device <id>`) while
   signed in.
2. Tap the "Connected" badge → confirm the Alert dialog appears.
3. Tap Cancel → confirm nothing changes.
4. Tap the badge again → tap Log out → confirm the app returns to the
   "Connect Google Calendar" onboarding screen.
5. Tap "Connect Google Calendar" → confirm Google's account picker appears
   (rather than silently signing back in).
6. Trigger a recording (press-and-hold mic) and, while `phase !== 'idle'`,
   attempt to tap the badge → confirm no dialog appears.

## Performance Considerations

None — this is a low-frequency, user-initiated UI action with no
performance-sensitive path.

## Migration Notes

Not applicable — no data model or persisted schema changes.

## References

- Related research: findings supplied directly in this planning session
  (see `src/lib/google-calendar-auth.ts:51-53`,
  `src/hooks/use-google-calendar-session.ts:85-89`, `src/app/index.tsx:200`,
  `src/app/index.tsx:299-307`).

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a
> step lands. Do not rename step titles.

### Phase 1: Logout affordance & wiring

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Type checking passes: `npx tsc --noEmit`
- [x] 1.3 Existing test suite still passes: `npm test`

#### Manual

- [x] 1.4 Tapping the badge while idle shows the confirm dialog
- [x] 1.5 Cancel dismisses with no state change
- [x] 1.6 Log out returns to the onboarding "Connect Google Calendar" screen
- [x] 1.7 Badge tap is a no-op while phase is not idle
- [x] 1.8 Reconnecting after logout shows Google's account picker
