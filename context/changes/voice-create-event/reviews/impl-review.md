<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Voice Create Event Implementation Plan

- **Plan**: context/changes/voice-create-event/plan.md
- **Scope**: All 5 phases
- **Date**: 2026-08-22
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Wake-word start() has no re-entrancy guard

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/wake-word.ts:47-50, src/app/index.tsx:56-61
- **Detail**: `PorcupineManager.start()` guards re-entrancy only with `if (this._isListening) return;` checked before any await. If two calls race before the first resolves, both pass the guard and both call `addFrameListener`, which pushes unconditionally with no dedup — the same frame listener ends up registered twice, so a single wake word fires `onWake` (and thus `handleWake`) twice. This is reachable: index.tsx registers both `onDisconnect` and `onError` on the same session, each independently calling `wakeWordRef.current?.start()` with no shared guard — a genuine mid-session failure plausibly fires both, and a double `onWake` would attempt to start two ElevenLabs sessions from one wake event.
- **Fix A ⭐ Recommended**: Add an in-flight-start guard inside `useWakeWordListener`'s `start()` (mirror the existing `managerPromiseRef` pattern with an `isStartingRef`), so concurrent callers converge on the same start attempt.
  - Strength: Fixes it once at the source; protects every future caller, not just index.tsx's two call sites.
  - Tradeoff: Touches the already-reviewed-and-committed wake-word.ts; small but real edit.
  - Confidence: HIGH — same pattern already used for lazy manager init in the same file (getManager()).
  - Blind spot: Haven't reproduced the double-fire on-device; this is a code-path analysis, not an observed bug.
- **Fix B**: Guard at the two call sites in index.tsx (onDisconnect/onError) with a shared "already resuming" flag.
  - Strength: No change to the already-committed wake-word.ts.
  - Tradeoff: Leaves the underlying hook still unsafe for any other caller; duplicates guard logic per call site.
  - Confidence: MEDIUM — works for this screen's two call sites but doesn't generalize.
  - Blind spot: None significant.
- **Decision**: FIXED (via Fix A) — src/lib/wake-word.ts:17,47-56

### F2 — Unhandled rejection on malformed startDateTime from the agent

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/create-event-tool.ts:14-20
- **Detail**: `endDateTime` is computed from `params.startDateTime` OUTSIDE the try block. `startDateTime` is LLM-generated from voice input — a plausible source of a malformed ISO string. `new Date(invalid)` gives `NaN`, and `.toISOString()` on that throws `RangeError` before the try block is ever entered. `handleCreateEventTool` is registered directly as the ElevenLabs `create_event` client tool with no wrapping try/catch in index.tsx either, so a malformed date from the agent produces an unhandled rejection instead of the graceful spoken error string every other failure path returns.
- **Fix**: Move the `endDateTime` computation inside the try block (or validate `params.startDateTime` up front) so a parse failure returns a spoken error string like the other failure paths.
- **Decision**: FIXED — src/lib/create-event-tool.ts:17-20

### F3 — Built-in wake word substituted for the plan's custom keyword, undisclosed in Progress

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/wake-word.ts:6-8, plan.md Phase 1 item #4
- **Detail**: Phase 1's "Custom wake word asset" deliverable (author a keyword in the Picovoice Console, bundle the .ppn) was never completed — no .ppn exists anywhere outside ios/Pods/. wake-word.ts uses Porcupine's built-in "Jarvis" keyword instead, self-documented in-code with a swap-out comment. This was a live, discussed decision during implementation (the user chose the built-in-keyword path when this was flagged as a missing Picovoice Console asset), so it's not a surprise — but the plan's Progress section doesn't disclose it anywhere, so a future reader auditing Progress alone would assume a custom keyword is in place.
- **Fix**: Add a short note under change.md's "Notes" section recording that "Jarvis" (Porcupine built-in) is a stand-in for a custom wake word pending a Picovoice Console asset.
- **Decision**: FIXED — context/changes/voice-create-event/change.md Notes section

### F4 — npm test uses --watchAll, never exits non-interactively

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: package.json:56
- **Detail**: `"test": "jest --watchAll"` runs indefinitely. No CI exists yet so this is latent, not actively broken, but every phase's automated verification in this plan literally runs `npm test -- --watchAll=false` to work around it — a sign the default script itself is set up for interactive use only, which would hang a future CI job that just runs `npm test`.
- **Fix**: Change to `"test": "jest"` and add `"test:watch": "jest --watchAll"` for local interactive use.
- **Decision**: FIXED — package.json:56-57

### F5 — Unmount cleanup in wake-word.ts fires stop()/delete() unawaited

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/wake-word.ts:24-31
- **Detail**: `stop()` is async and can throw `PorcupineRuntimeError`; the cleanup effect doesn't await or catch it, unlike the module's own exported `stop()` which explicitly swallows `PorcupineInvalidStateError`. Low real-world impact since this single-screen app effectively never unmounts VoiceScreen — matters mainly on hot-reload during dev.
- **Fix**: await stop() before delete(), wrap in try/catch.
- **Decision**: FIXED — src/lib/wake-word.ts:25-38

### F6 — Duplicated inline params type across three files

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: create-event-tool.ts:5-9, index.tsx:36, google-calendar-api.ts:15-19 (DraftEvent)
- **Detail**: `{ title, startDateTime, durationMinutes? }` is independently declared three times instead of importing the existing `DraftEvent` type. Minor DRY nit, no functional issue.
- **Fix**: Import and reuse `DraftEvent` from google-calendar-api.ts in the other two locations.
- **Decision**: FIXED — src/lib/create-event-tool.ts:1-5, src/app/index.tsx:14-17,35-36

### F7 — No idempotency key on createEvent

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/google-calendar-api.ts:86-116
- **Detail**: A lost response after a successful create + voice retry could duplicate an event. Inherent to the fetch-based, no-backend MVP design — accepted tradeoff, not a defect to fix now.
- **Fix**: None proposed — accepted tradeoff for MVP scope.
- **Decision**: ACCEPTED

### F8 — Hook-based ElevenLabs API used instead of the plan's literal Conversation.startSession

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/app/index.tsx (ConversationProvider / useConversationControls)
- **Detail**: Already surfaced and adapted during Phase 4 implementation — the installed @elevenlabs/react-native SDK has no Conversation class or static startSession at all; the hook-based API is the only one that exists. Both review sub-agents independently confirmed all five behavioral intents (listener-stop-before-session-start ordering, tool registration, dynamicVariables for date/timezone anchoring, disconnect/error resume, 401 teardown) are correctly met. Purely informational — no action needed.
- **Fix**: None — no action needed.
- **Decision**: DISMISSED (already resolved during implementation)
