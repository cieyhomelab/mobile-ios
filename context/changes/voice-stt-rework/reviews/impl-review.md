<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Voice STT Rework Implementation Plan

- **Plan**: context/changes/voice-stt-rework/plan.md
- **Scope**: Full plan (Phases 1-4)
- **Date**: 2026-08-22
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Press-and-hold can stop a recording before it started

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/app/index.tsx:29-38 (handlePressIn/handlePressOut), src/lib/audio-recorder.ts:20-38 (start/stop)
- **Detail**: `handlePressIn` sets `phase` to `'recording'` synchronously and calls `recorder.start()` without awaiting it. `start()` does several awaits (permission check, `setAudioModeAsync`, `prepareToRecordAsync`) before it actually calls `recorder.record()`. Because `phase` is already `'recording'`, a quick tap (release before `start()`'s promise chain resolves) lets `handlePressOut` call `recorder.stop()` concurrently with, or before, `record()` has actually run. The outer try/catch means this won't crash, but it surfaces a generic pipeline error on what should be harmless input — a fast tap-and-release is a normal thing to happen on a press-and-hold control.
- **Fix**: In `audio-recorder.ts`, track the in-flight `start()` promise and have `stop()` await it (swallowing its own rejection) before calling `recorder.stop()`, so a stop always waits for any pending start to actually finish first.
  - Strength: Closes the race entirely without a magic timing threshold; no dropped input, no double-set state.
  - Tradeoff: A very fast tap now waits out the full permission/prepare sequence before it can stop — a few hundred ms of perceived lag on the fastest possible taps.
  - Confidence: HIGH — this is the standard pattern for guarding against exactly this class of race.
  - Blind spot: Haven't verified real-device timing for how long `prepareToRecordAsync()` takes on first permission grant; the tradeoff above could be more noticeable then.
- **Decision**: FIXED — `audio-recorder.ts` now tracks the in-flight `start()` promise in a ref and `stop()` awaits it (swallowing rejection) before calling `recorder.stop()`.

### F2 — Status label goes silent during transcribing/parsing/creating

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/app/index.tsx:107-112, 157-159 (statusLabel)
- **Detail**: The plan's own Phase 4 contract says the `ScreenPhase` union should "drive a status label (mirroring the existing glanceable-status-text pattern)" — the pre-rework screen's `statusLabel(status, message)` covered every state including surfacing live error text. The shipped `statusLabel(phase)` only handles `'idle' | 'recording'`; the `'transcribing' | 'parsing' | 'creating'` phases fall through to a bare `ActivityIndicator` with no text, so the user can't tell which of the three remote calls is in flight.
- **Fix**: Extend `statusLabel` to cover all six `ScreenPhase` values (e.g. "Transcribing…", "Understanding…", "Creating event…") and show it alongside (or instead of) the spinner, per the plan's stated intent.
- **Decision**: FIXED — `statusLabel` now switches on the full `ScreenPhase`, and the button shows a spinner alongside the label text during `transcribing`/`parsing`/`creating`.

### F3 — No unmount guard on async pipeline state updates

- **Severity**: ⚡ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/app/index.tsx:34-37, 51-54
- **Detail**: `setPipelineError`/`setPhase` after awaited async work have no unmount guard. If `VoiceScreen` unmounts mid-pipeline this produces a harmless React warning, not a real bug — this is a single-screen app with no navigation away from `VoiceScreen`.
- **Fix**: None needed now; worth a guard only if navigation away from this screen is ever added.
- **Decision**: SKIPPED — no navigation exists that would trigger this.

### F4 — `startDateTime` shape isn't validated after parsing

- **Severity**: ⚡ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/event-parser.ts:75-79
- **Detail**: Only `title`/`startDateTime` presence is checked before returning a `DraftEvent`; nothing enforces that `startDateTime` is a well-formed ISO string with a UTC offset, even though the tool schema asks Claude for one. A malformed value would flow into `formatDraftTime`/`createEvent` as an "Invalid Date". This mirrors the pre-existing lack of validation in `createEvent` itself, so it's consistent with this codebase's existing risk tolerance rather than a new regression.
- **Fix**: None needed now; flagging for awareness only.
- **Decision**: SKIPPED — consistent with existing risk tolerance in this codebase.

## Additional notes (not findings)

- **Plan Drift Detection**: clean MATCH across all 4 phases — every planned Contract (STT auth header, `model_id`, RN FormData shape, forced tool-use parsing, UTC-offset anchoring, audio session activation) verified against the actual code and against live vendor docs where the plan flagged uncertainty. No scope creep: `git diff --name-status 5b848f6^..b0c054d` touches exactly the files the plan named. `google-calendar-api.ts`, `create-event-tool.ts`, `use-google-calendar-session.ts` confirmed untouched.
- **Success Criteria**: all automated checks (`tsc --noEmit`, `npm run lint`, `npm test` — 17/17) re-run and passing. All manual Progress checkboxes for Phases 1–4 are `[x]`; Phase 4's manual end-to-end items were confirmed by the user this session (no diff evidence expected for on-device manual checks — not treated as rubber-stamping).
