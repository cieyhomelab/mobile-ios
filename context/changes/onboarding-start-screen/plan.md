# Onboarding Start Screen Implementation Plan

## Overview

Add a short explanatory note to the existing signed-out screen, shown before the "Connect Google Calendar" button, telling the user why the app needs Calendar access. This is roadmap Foundation F-02. Just-in-time microphone permission — the other half of F-02's stated outcome — is already implemented in `src/lib/audio-recorder.ts:21-38` and is untouched by this plan.

## Current State Analysis

`src/app/index.tsx` is a single screen (`VoiceScreen`) that branches on `session.state` from `useGoogleCalendarSession()`. When `session.state === 'signedOut'` (`src/app/index.tsx:199-213`), it renders a "Connect Google Calendar" `Pressable` and, if `session.error` is set, an inline error message — with no framing or explanation before the OAuth prompt. F-01 (`google-calendar-oauth`) is already fully wired (`src/hooks/use-google-calendar-session.ts`, `src/lib/google-calendar-auth.ts`), so this change's only prerequisite is satisfied.

There is no persistence library (`AsyncStorage`/`expo-secure-store`) in `package.json`, and no component-test tooling (no `@testing-library/react-native`, no `*.test.tsx` files anywhere in `src/`) — UI screens in this codebase are verified manually; only `src/lib/*` business logic carries `*.test.ts` unit tests.

## Desired End State

When the app is signed out, the user sees a short paragraph explaining that the app needs Google Calendar access to create/check/delete events by voice, rendered above the existing "Connect Google Calendar" button — on the same screen, no extra tap. The note reappears every time the user is in the signed-out state (including after a forced sign-out from a revoked/expired token), matching the existing button's behavior. Nothing else about the signed-out or signed-in flow changes.

Verify by: cold-launching the app signed out (or via `forceSignOut`) and confirming the note renders above the Connect button, in both light and dark mode, without affecting the signed-in voice flows.

### Key Discoveries:

- `src/app/index.tsx:199-213` — the exact insertion point; the note goes inside the existing `session.state === 'signedOut'` fragment, above the `Pressable`.
- `src/components/hint-row.tsx` and `src/components/web-badge.tsx` — established pattern for small, single-purpose presentational components sitting alongside `ThemedText`/`ThemedView`.
- `src/constants/theme.ts` — `Spacing` scale and `ThemeColor` (`text`, `textSecondary`, etc.) to reuse; no new colors or spacing values needed.
- PRD guardrail ("Privacy of calendar data — calendar contents and voice recordings are not exposed or retained beyond what's needed to fulfill the request") — the copy folds this into the explanation to pre-empt Google's own sensitive-scope consent warning.

## What We're NOT Doing

- No persisted "seen it" state — the note shows every time `session.state === 'signedOut'`, not just on first-ever launch. No new storage dependency.
- No separate onboarding step/screen with a "Continue" tap — the note and the Connect button live on the same screen.
- No changes to `app-tabs.tsx` or `_layout.tsx` — the tab bar keeps rendering as it does today regardless of session state.
- No changes to OAuth error handling or copy in `use-google-calendar-session.ts` — `session.error` continues to render exactly as it does now.
- No new test tooling — this follows the existing UI-screens-are-manually-verified convention.

## Implementation Approach

Add one small presentational component that renders the explanatory copy, and render it inside the existing `signedOut` branch of `src/app/index.tsx`, above the Connect button. This mirrors how `hint-row.tsx` and `web-badge.tsx` are already used as small standalone display components composed into a screen.

## Phase 1: Add the Calendar access explanation

### Overview

Adds the explanatory note and wires it into the signed-out branch of the home screen.

### Changes Required:

#### 1. New explanation component

**File**: `src/components/calendar-access-note.tsx`

**Intent**: A small presentational component that renders one short paragraph explaining why the app needs Google Calendar access, styled consistently with the rest of the app (muted/secondary text, centered, matching the tone of existing copy in `index.tsx`/`explore.tsx`).

**Contract**: Exports a component with no props, rendering via `ThemedText` (`type="small"`, `themeColor="textSecondary"`, centered). Copy (verbatim):

> "To create, check, and delete events by voice while you drive, this app needs access to your Google Calendar. It only reads and writes events — nothing else is accessed, and nothing is shared beyond what's needed to fulfill your request."

#### 2. Wire the note into the signed-out screen

**File**: `src/app/index.tsx`

**Intent**: Show the new note above the "Connect Google Calendar" button so the user reads the explanation before being asked to sign in.

**Contract**: Import `CalendarAccessNote` and render it as the first child inside the existing `session.state === 'signedOut'` fragment (`src/app/index.tsx:199-213`), immediately before the `Pressable` that triggers `session.handleConnect()`. No changes to the `Pressable`, the error message rendering, or any other branch of `VoiceScreen`.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`
- [ ] Existing unit tests still pass: `npm test`

#### Manual Verification:

- [ ] With the app signed out (fresh install, or after `forceSignOut` via a 401), the explanation note renders above the "Connect Google Calendar" button
- [ ] Note text is legible and correctly themed in both light and dark mode
- [ ] Signing in still works unchanged — note disappears once `session.state === 'signedIn'`
- [ ] No layout shift or overlap between the note and the existing button/error text on a small iOS simulator screen size

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- None added — this is a static presentational component with no logic; matches the codebase's existing convention of not unit-testing UI screens/components.

### Integration Tests:

- None — no test framework for RN components exists in this project (see Current State Analysis).

### Manual Testing Steps:

1. Force the app into the signed-out state (fresh simulator install, or trigger `forceSignOut` via an expired/revoked token) and confirm the note appears above the Connect button.
2. Toggle system light/dark mode and confirm the note's text color follows theme (`textSecondary`).
3. Tap "Connect Google Calendar" and confirm the sign-in flow and post-sign-in voice screen are unaffected.
4. Trigger a sign-in decline/cancel and confirm the existing `session.error` message still renders correctly alongside the note.

## Performance Considerations

None — a single static text component with no async work, no re-renders beyond the existing `session.state` transitions.

## Migration Notes

Not applicable — no data model or persisted state involved.

## References

- Roadmap: `context/foundation/roadmap.md` (F-02: Onboarding / start screen)
- PRD: `context/foundation/prd.md` (Access Control, Success Criteria guardrails)
- Prior related plan: `context/changes/google-calendar-oauth/plan.md`
- Just-in-time mic permission (already implemented): `src/lib/audio-recorder.ts:21-38`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Add the Calendar access explanation

#### Automated

- [x] 1.1 Type checking passes: `npx tsc --noEmit`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 Existing unit tests still pass: `npm test`

#### Manual

- [x] 1.4 Note renders above the Connect button when signed out
- [x] 1.5 Note is legible and correctly themed in light and dark mode
- [x] 1.6 Signed-in flow unaffected; note disappears once signed in
- [x] 1.7 No layout shift/overlap with existing button/error text
