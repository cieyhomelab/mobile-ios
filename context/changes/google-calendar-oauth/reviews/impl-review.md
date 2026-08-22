<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Google Calendar OAuth Sign-in

- **Plan**: context/changes/google-calendar-oauth/plan.md
- **Scope**: Phase 1 + Phase 2 (full plan)
- **Date**: 2026-08-22
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Non-401 fetch errors force an unnecessary full re-auth

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/index.tsx:30-36 (loadEvents catch block)
- **Detail**: The plan's contract only specifies clearing the session and resetting to the signed-out screen on a 401 (revoked access). The current catch block resets to `signedOut` and clears `events` on *any* thrown error from `listUpcomingEvents()` — a transient network blip or a Google 500 also kicks the user back to the "Connect Google Calendar" button, even though their local Google session is still valid. `signOutLocally()` is correctly gated to the 401 branch only; the UI state reset isn't.
- **Fix**: Only reset to `signedOut` inside the `status === 401` branch. For other errors, keep `state: 'signedIn'` (don't clear `events`) and set `error` to something like "Couldn't refresh events" instead.
- **Decision**: FIXED

### F2 — Undocumented `android.package` addition in app.json

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: app.json (android block), landed in Phase 1's commit 8629962
- **Detail**: Phase 1's contract #2 says only "Add bundleIdentifier under the existing ios object." The actual Phase 1 commit also added `android.package: "com.mkulesza.voiceassistant"`, which the plan never asked for. It's inert — no Android OAuth client exists, so this field does nothing yet — and mirrors the iOS identifier sensibly, but it's scope the plan didn't authorize, and Android is explicitly listed under "What We're NOT Doing."
- **Fix**: No code change needed — harmless and consistent. Just note it in the plan as an addendum so future readers know why it's there.
- **Decision**: FIXED (addendum added to plan.md under Phase 1 change #2)

### F3 — `configureGoogleAuth()` runs at both module load and component mount

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Architecture
- **Location**: src/lib/google-calendar-auth.ts:18, src/app/index.tsx:41
- **Detail**: Both calls are protected by an idempotency guard, so this is safe — but it means the "call once at module load, not in a component" intent from the plan's Critical Implementation Details is satisfied at the module level while the screen also calls it redundantly (per the Phase 2 contract, which explicitly requires that mount-time call). No action needed; noting for future readers.
- **Decision**: SKIPPED

### F4 — No re-entrancy guard on the "Connect" button

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/app/index.tsx:56-64
- **Detail**: Rapid double-tap could fire two concurrent `signInInteractively()` calls. Low risk in practice (Google's native sign-in sheet likely serializes this), but a `isConnecting` flag or disabling the button while in flight would close it off.
- **Decision**: FIXED

### F5 — Sign-in failures collapse to one generic error message

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/lib/google-calendar-auth.ts:24,37
- **Detail**: Cancellation, scope denial, and actual network/config failures all surface as the same "Calendar access is required" string. Acceptable for this throwaway MVP verification screen; would need distinguishing in a polished UI.
- **Decision**: SKIPPED
