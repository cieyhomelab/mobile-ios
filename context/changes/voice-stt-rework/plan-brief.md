# Voice STT Rework — Plan Brief

> Full plan: `context/changes/voice-stt-rework/plan.md`

## What & Why

The shipped `voice-create-event` feature uses ElevenLabs' hosted Conversational AI agent (LiveKit WebRTC) to bundle speech-to-text, dialogue, confirmation, and text-to-speech into one server-side session. This rework replaces that with a self-owned pipeline built on ElevenLabs' plain Speech-to-Text REST API: push-to-talk recording → transcription → Claude-based structured parsing → on-screen confirm → the existing (unchanged) Google Calendar creation logic.

## Starting Point

`google-calendar-api.ts` and `create-event-tool.ts` (conflict check, creation, 401 teardown) are already implemented and tested — they don't change. What's being replaced is everything upstream of them: Porcupine wake-word detection, the ElevenLabs agent session, and the dashboard-configured dialogue/confirmation policy.

## Desired End State

The user holds a button, dictates an event in plain English, releases, and sees the parsed title/date/time on screen with Confirm/Cancel. Confirm runs the same conflict-check-then-create flow as before; a spoken confirmation loop is no longer part of the flow.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Overall architecture | Full replacement of the ElevenLabs Conversational AI agent | The plain STT endpoint has no LLM/TTS/tool-calling, so a hybrid with the old agent would mean maintaining two voice systems. |
| Transcript → structured data | Claude API tool-use call | Most robust to natural phrasing ("tomorrow at 3") without inventing a rigid voice grammar. |
| Confirm-before-create gate | On-screen tap (Confirm/Cancel) | Simplest, most reliable; the old dashboard-configured dialogue policy no longer exists to enforce this in-conversation. |
| Recording trigger | Push-to-talk button | Avoids building voice-activity/silence detection that the old hosted agent handled internally. |
| Audio format | AAC/`.m4a` via `expo-audio` | Matches Expo's default recorder output; no transcoding step. |
| Dependency cleanup | Remove LiveKit/ElevenLabs-agent/Picovoice entirely | No dead native modules left in the build. |
| STT/parse failure handling | Single attempt, inline error, manual retry | Matches the app's existing minimal error-surfacing pattern. |
| Testing | Unit tests with mocked `fetch` only | Matches existing repo convention; no live-API smoke test script. |

## Scope

**In scope:**
- Removing ElevenLabs Conversational AI / LiveKit / Picovoice wake-word dependencies and config
- `expo-audio`-based push-to-talk recording
- ElevenLabs Speech-to-Text REST client
- Claude API transcript-to-structured-event parser
- On-screen confirm/cancel UI replacing the wake-word/agent screen

**Out of scope:**
- Android support, spoken (TTS) confirmation, hands-free wake-word triggering, automatic retry/backoff, diarization/PII features, live-API smoke tests, waveform visualization, any change to the existing Calendar creation logic

## Architecture / Approach

Each new piece is a small `fetch`-based module in `src/lib/` (`voice-stt.ts`, `event-parser.ts`, `audio-recorder.ts`), following the exact client conventions `google-calendar-api.ts` already established (domain type, `*ApiError`, plain `fetch`) rather than adding either vendor's Node SDK. `src/app/index.tsx` orchestrates the pipeline through a `ScreenPhase` state machine (`idle → recording → transcribing → parsing → confirming → creating`) and hands off to the existing, unchanged `handleCreateEventTool`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dependency cleanup, permissions & credentials | LiveKit/agent/Picovoice removed; `expo-audio` added; credentials updated | Removing native modules requires a clean prebuild — could surface an unrelated build break |
| 2. ElevenLabs Speech-to-Text client | `transcribeAudio()` with unit tests | ElevenLabs' documented `model_id` value was inconsistent across doc snapshots during planning — must verify live |
| 3. Transcript → structured event parser | `parseEventFromTranscript()` via Claude tool-use, with unit tests | Relative date/time anchoring must be threaded into the prompt correctly, or "tomorrow" resolves wrong |
| 4. Push-to-talk recording + screen rewrite | Full record → transcribe → parse → confirm → create UI | First time this app activates iOS's recording audio session directly — needs on-device verification |

**Prerequisites:** ElevenLabs API key (STT-scoped) and an Anthropic API key, both added to `voice-config.ts` as placeholders (never hardcode real values in the repo).
**Estimated effort:** ~1-2 sessions across 4 phases — smaller than the original 5-phase feature since the Calendar-write logic is fully reused.

## Open Risks & Assumptions

- ElevenLabs STT's exact `model_id` enum value needs a live-docs check at implementation time (flagged in the plan's Critical Implementation Details).
- `expo-audio`'s exact audio-session-activation call needs a live-docs check at implementation time.
- Assumes the user always dictates in English (fixed `language_code: 'en'`, per your confirmed choice).

## Success Criteria (Summary)

- Holding the button, dictating an event, and releasing produces an accurate on-screen title/date/time within a few seconds
- Confirm creates the event (respecting the existing conflict check); Cancel creates nothing
- STT/parse failures surface a clear inline error and allow an immediate retry, with no automatic retry logic
