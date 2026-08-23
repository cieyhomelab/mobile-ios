<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Logout / Switch Google Account

- **Plan**: context/changes/switch-screen/plan.md
- **Scope**: Phase 1 of 1
- **Date**: 2026-08-23
- **Verdict**: APPROVED
- **Findings**: 0 critical | 1 warning | 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — handleLogout breaks the file's async-handler shape

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/index.tsx:191-198, :223
- **Detail**: Every other async operation in this file (handlePressOut, handleConfirm, handleDeletePressOut, handleConfirmDelete, handleReadToday) is a sync useCallback that internally fires `void (async () => {...})()`. handleLogout is instead declared `async` itself, pushing the `void` wrapper out to the JSX call site (`onLogout={() => void handleLogout()}`). Functionally equivalent, but it's the one handler in the file with a different shape.
- **Fix**: Make handleLogout a sync useCallback wrapping its body in `void (async () => {...})()`, and pass `onLogout={handleLogout}` directly at the call site — matching the other five handlers.
- **Decision**: FIXED

### F2 — forceSignOut rejection inside handleLogout is unhandled

- **Severity**: 📝 OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: src/app/index.tsx:191-198, :223
- **Detail**: `session.forceSignOut()` → `signOutLocally()` → `GoogleSignin.signOut()` can reject; `void handleLogout()` has no `.catch`. This matches the plan's explicit decision ("No try/catch error-surfacing UI for a failed signOutLocally() call — local state is cleared regardless of the outcome") and the same bare fire-and-forget shape already used elsewhere (e.g. the 401-recovery callback passed into handleCreateEventTool). Not a regression — flagging only because this is now reachable from direct user action rather than only an incidental error path. No fix proposed; the plan deliberately scoped this out.
- **Decision**: SKIPPED

### F3 — handleLogoutPress isn't memoized

- **Severity**: 📝 OBSERVATION
- **Dimension**: Pattern Consistency
- **Location**: src/app/index.tsx:310-315
- **Detail**: Plain function inside HomeView rather than useCallback. HomeView isn't memoized and none of its other inline logic is wrapped this way either, so this is cosmetic, not a correctness issue.
- **Decision**: SKIPPED

### F4 — session.error survives past logout

- **Severity**: 📝 OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: src/hooks/use-google-calendar-session.ts:85-89
- **Detail**: forceSignOut() doesn't clear `session.error`, so a stale error set before logout could persist into the post-logout OnboardingView. Out of scope for this phase (plan explicitly excludes changes to use-google-calendar-session.ts) — noting for future awareness only.
- **Decision**: SKIPPED
