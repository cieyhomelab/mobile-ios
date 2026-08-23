# Onboarding Start Screen — Plan Brief

> Full plan: `context/changes/onboarding-start-screen/plan.md`

## What & Why

Add a short explanation of why the app needs Google Calendar access, shown above the existing "Connect Google Calendar" button when the user is signed out. This is roadmap Foundation F-02 — it mitigates Google's "sensitive scope" consent warning by giving the user context before the OAuth prompt, rather than surfacing a bare connect button with no framing.

## Starting Point

F-01 (`google-calendar-oauth`) is already fully wired — `use-google-calendar-session.ts` and `google-calendar-auth.ts` handle sign-in, silent re-auth, and 401 recovery. `src/app/index.tsx` renders a bare "Connect Google Calendar" button when signed out, with no explanation beforehand. Separately, just-in-time microphone permission — the other half of F-02's original scope — is already implemented in `src/lib/audio-recorder.ts` and needs no further work.

## Desired End State

When signed out, the user sees a short paragraph explaining the app needs Calendar access to create/check/delete events by voice, directly above the Connect button — no extra screen, no extra tap. It reappears any time the user is signed out (including after a forced sign-out), not just on first-ever launch.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Persistence | Show every signed-out session, no "seen it" flag | Avoids adding a new storage dependency for a single-user app where re-showing on sign-out is harmless. | Plan (question) |
| Screen structure | Same screen, stacked above the Connect button | Fewer taps; matches the roadmap's own "keep it short and skippable-by-speed" guidance. | Plan (question) |
| Copy depth | One short paragraph | Matches the terse tone already used elsewhere in the app; roadmap explicitly warns against over-explaining. | Plan (question) |
| Tab bar during onboarding | Left unchanged, stays visible | Zero navigation-shell risk for a cosmetic gain that's out of proportion to a LOW-complexity change. | Plan (question) |
| Sign-in error copy | Unchanged | Existing `session.error` text is already accurate and short; touching auth code is out of this change's scope. | Plan (question) |
| Testing approach | Manual verification only, no new test tooling | Matches the existing convention — no RN component-test library in the project; only `src/lib/*` gets unit tests. | Plan (research) |

## Scope

**In scope:** One new presentational component (`src/components/calendar-access-note.tsx`) with a fixed one-paragraph explanation; wiring it into the `signedOut` branch of `src/app/index.tsx`, above the Connect button.

**Out of scope:** Persisted "seen it" state, a separate onboarding step/screen, tab-bar visibility changes, OAuth error-copy changes, microphone-permission changes (already done), any new test tooling.

## Architecture / Approach

A single small `ThemedText`-based component, composed into the existing signed-out branch — the same pattern already used for `hint-row.tsx` and `web-badge.tsx` elsewhere in the app.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Add the Calendar access explanation | New component + wiring into `index.tsx`'s signed-out branch | Low — static text, no logic; main risk is layout/theming regressions on the existing button/error rendering |

**Prerequisites:** None beyond what's already in the repo — F-01 is done.
**Estimated effort:** Single phase, well under a session.

## Open Risks & Assumptions

- Assumes re-showing the note after every forced sign-out (rather than only on first-ever install) is acceptable — confirmed with the user during planning.

## Success Criteria (Summary)

- A signed-out user sees the explanation above the Connect button, in both light and dark mode.
- The signed-in voice flows (create/read/delete event) are completely unaffected.
