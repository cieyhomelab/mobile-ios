# Voice STT Rework Implementation Plan

## Overview

Replace the voice-create-event feature's hosted ElevenLabs Conversational AI agent (LiveKit-based, bundling STT+LLM+TTS+tool-calling) with a self-owned pipeline built on ElevenLabs' plain Speech-to-Text REST endpoint: a push-to-talk button records audio locally, the recording is transcribed via ElevenLabs STT, the transcript is parsed into a structured event via a Claude API call, the user confirms the parsed event on-screen, and the existing (unchanged) Google Calendar creation logic takes it from there.

## Current State Analysis

The shipped `voice-create-event` feature (`context/changes/voice-create-event/`, all 5 phases complete) uses `@elevenlabs/react-native`'s `ConversationProvider` to run a full-duplex hosted agent over LiveKit WebRTC: Porcupine wake-word detection (`src/lib/wake-word.ts`) triggers `startSession()`, the ElevenLabs agent handles STT, dialogue, read-back/confirmation, and TTS entirely server-side (configured in the ElevenLabs dashboard), and calls a client-side `create_event` tool (`src/lib/create-event-tool.ts`) which checks for conflicts and writes to Google Calendar.

This rework only touches the audio-in-to-parsed-intent portion of that pipeline. The Google Calendar write path is untouched and reusable as-is:

### Key Discoveries:

- `src/lib/google-calendar-api.ts:1-39` (`DraftEvent`, `createEvent`, `findConflictingEvents`, `CalendarApiError`) and `src/lib/create-event-tool.ts:1-39` (`handleCreateEventTool`) are already implemented, already unit-tested (`*.test.ts` siblings), and need no changes — the new pipeline calls `handleCreateEventTool(draftEvent, onUnauthorized)` exactly as the ElevenLabs tool call did before.
- `src/hooks/use-google-calendar-session.ts` (the sign-in/token hook) and the existing 401 teardown convention are also untouched by this rework.
- ElevenLabs' plain Speech-to-Text REST endpoint (`POST https://api.elevenlabs.io/v1/speech-to-text`) authenticates via an `xi-api-key` header (confirmed against ElevenLabs' live authentication docs during planning — an initial cookbook fetch suggested `Authorization: Bearer`, which is wrong for this endpoint). It takes a multipart `file` upload plus `model_id`/`language_code` fields and returns JSON with a top-level `text` field (plus word-level timestamps not needed here). It is a batch/synchronous call — no dialogue state, no LLM, no TTS.
- Expo SDK 57 ships `expo-audio` (distinct from the older `expo-av`) with `useAudioRecorder(RecordingPresets.HIGH_QUALITY)`, which records AAC/`.m4a` on iOS by default — no transcoding step needed before uploading to ElevenLabs STT.
- `app.json:31-56` currently registers `@livekit/react-native-expo-plugin`, `@config-plugins/react-native-webrtc`, and an `expo-build-properties` entry (`buildReactNativeFromSource: true`) — all added specifically to support LiveKit/react-native-webrtc's native module requirements and now dead weight once that dependency is removed.
- `src/lib/voice-config.ts` holds hardcoded credential constants (`ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `PICOVOICE_ACCESS_KEY`) following the same embedded-credential precedent as `google-calendar-auth.ts`. This rework keeps `ELEVENLABS_API_KEY` (now used for the STT endpoint instead of the agent), drops the two agent/wake-word-specific keys, and adds a new one for the Claude API call.

## Desired End State

With the app signed in to Google Calendar, the Home screen shows a press-and-hold button instead of automatic wake-word listening. The user holds the button, dictates an event in plain English, and releases. The app transcribes the recording via ElevenLabs STT, sends the transcript to Claude to extract a structured `{title, startDateTime, durationMinutes}`, and shows the parsed event on screen with Confirm/Cancel controls. Tapping Confirm runs the existing conflict-check-then-create flow (same as before: a conflict is surfaced back to the user before anything is created); tapping Cancel discards the draft with no side effects. A single-attempt inline error is shown if the STT call, the parse call, or the create call fails, and the screen returns to idle so the user can retry by holding the button again. A revoked-access 401 during creation still triggers the existing sign-out teardown.

**Verification:** run the phase Success Criteria below; Phase 4's manual end-to-end test is the authoritative check that the full record → transcribe → parse → confirm → create loop works on-device.

## What We're NOT Doing

- Android support (the app remains iOS-only, matching the existing OAuth/voice foundation).
- Wake-word/hands-free triggering — Porcupine and `src/lib/wake-word.ts` are removed; recording is push-to-talk only.
- A spoken (TTS) confirmation round-trip — confirmation is an on-screen tap, not a second STT call.
- Automatic retry/backoff on STT or LLM failures — a single attempt per action, with a manual retry via the UI.
- ElevenLabs STT's diarization, PII/entity-detection, or multi-channel features — single-speaker, no PII handling needed.
- A manual smoke-test script hitting the live STT/LLM APIs outside CI — unit tests use mocked `fetch` only.
- Audio waveform/level visualization during recording — a simple status label only.
- Persisting recorded audio or transcripts after a request completes.
- Any change to `google-calendar-api.ts`, `create-event-tool.ts`, or `use-google-calendar-session.ts` — reused unchanged.
- ElevenLabs dashboard/agent configuration — there is no longer a hosted agent to configure; the confirm-before-create gate is enforced entirely in-app.

## Implementation Approach

Build the new audio-in-to-parsed-intent pipeline as small, independently unit-testable `fetch`-based modules in `src/lib/`, mirroring `google-calendar-api.ts`'s existing conventions exactly (a domain type, a `*ApiError extends Error` carrying `.status`, a plain `fetch` implementation) rather than reaching for either vendor's Node SDK — this keeps the pattern consistent with the one already established in this codebase and avoids two new heavy dependencies for what are otherwise two straightforward REST calls. Remove the now-dead LiveKit/ElevenLabs-agent/Picovoice native modules and their `app.json` config-plugin entries in the same phase as adding `expo-audio`, so there is only ever one prebuild/native-relink cycle to verify.

## Critical Implementation Details

**ElevenLabs STT authentication.** Use the `xi-api-key` header, not `Authorization: Bearer`. This was confirmed against ElevenLabs' live authentication docs during planning, but an earlier fetch of the STT cookbook itself suggested Bearer auth — verify against the current docs at implementation time before writing the request.

**`model_id` value needs a live check.** ElevenLabs' documentation snapshots seen during planning were inconsistent about the exact currently-valid `model_id` enum value for this endpoint (one example showed `scribe_v2`, the formal reference didn't enumerate options). Check the current API reference or ElevenLabs dashboard for the valid value before hardcoding it in Phase 2 — do not assume the planning-time example is still correct.

**Anchoring relative dates.** Claude has no inherent notion of "today" or the device's time zone, the same issue the original ElevenLabs-agent plan solved by passing dynamic variables. Pass the current local ISO date/time and IANA time zone into the Claude prompt, and require the tool's `startDateTime` output to always carry an explicit UTC offset — otherwise phrases like "tomorrow at 3pm" have no anchor and Google Calendar's `dateTime` field would be ambiguous.

**React Native multipart upload shape.** The STT request's `file` field must be a React Native-style `FormData` file entry — `{ uri, name, type }` — not a browser `Blob`/`File`. Using the wrong shape fails silently rather than throwing a clear error.

**Audio session activation.** Unlike the previous LiveKit-based session, this app has never directly activated iOS's recording audio session before. `expo-audio` requires enabling recording mode (e.g. via its audio-mode configuration call) before `record()` produces a usable file — confirm the exact call against `expo-audio`'s current SDK 57 docs at implementation time.

## Phase 1: Dependency cleanup, permissions & credentials

### Overview

Remove the now-dead ElevenLabs Conversational AI / LiveKit / Picovoice native dependencies and their config, add `expo-audio`, and update the embedded credential constants for the new pipeline.

### Changes Required:

#### 1. Package dependencies

**File**: `package.json`

**Intent**: Remove the native modules this rework makes obsolete; add the one new native module the push-to-talk recorder needs.

**Contract**: Remove `@elevenlabs/react-native`, `@livekit/react-native`, `@livekit/react-native-webrtc`, `@livekit/react-native-expo-plugin`, `livekit-client`, `@config-plugins/react-native-webrtc`, `@picovoice/porcupine-react-native`, `@picovoice/react-native-voice-processor`. Add `expo-audio` via `npx expo install expo-audio` so it's pinned to the SDK 57-compatible version automatically, matching the pattern of the project's other `expo-*` dependencies.

#### 2. iOS config plugins & microphone permission text

**File**: `app.json`

**Intent**: Drop the config-plugin entries and build property that existed solely for LiveKit/react-native-webrtc; register `expo-audio`'s config plugin; update the microphone usage description since listening is no longer wake-word-driven.

**Contract**: Remove the `"@livekit/react-native-expo-plugin"` and `"@config-plugins/react-native-webrtc"` plugin entries and the `expo-build-properties` block (`buildReactNativeFromSource: true`) — verify during Phase 1's manual build check that nothing else in the app still needs it before removing. Add `["expo-audio", { "microphonePermission": "<user-facing string>" }]`. Update `ios.infoPlist.NSMicrophoneUsageDescription` to describe push-to-talk recording rather than wake-word listening.

#### 3. Remove the wake-word listener

**File**: `src/lib/wake-word.ts`

**Intent**: Delete — Porcupine wake-word detection has no role in the push-to-talk flow.

**Contract**: File removed; no other file should import from it after Phase 4 rewrites `src/app/index.tsx`.

#### 4. Credential constants

**File**: `src/lib/voice-config.ts`

**Intent**: Drop the agent/wake-word-specific credentials this rework no longer uses; add the new Claude API key, following the same hardcoded-placeholder-constant precedent already used in this file.

**Contract**: Remove `ELEVENLABS_AGENT_ID` and `PICOVOICE_ACCESS_KEY`. Keep `ELEVENLABS_API_KEY` (now used for the STT endpoint). Add `ANTHROPIC_API_KEY` as a placeholder string constant with the same `TODO: replace with real values` comment convention already in this file.

### Success Criteria:

#### Automated Verification:

- Dependencies install cleanly: `npm install`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Existing tests still pass: `npm test`

#### Manual Verification:

- `npx expo prebuild --clean && npm run ios` builds and launches a dev client successfully with LiveKit/Picovoice native modules gone and `expo-audio` linked
- Launching the app on-device prompts for microphone permission with the updated description text

---

## Phase 2: ElevenLabs Speech-to-Text client

### Overview

A small, independently-testable client for ElevenLabs' Speech-to-Text REST endpoint.

### Changes Required:

#### 1. STT client

**File**: `src/lib/voice-stt.ts` (new)

**Intent**: Upload a locally-recorded audio file to ElevenLabs and return the transcript text, following `google-calendar-api.ts`'s existing client conventions (domain error type, plain `fetch`).

**Contract**: `transcribeAudio(fileUri: string): Promise<string>` — `POST https://api.elevenlabs.io/v1/speech-to-text` with header `xi-api-key: ${ELEVENLABS_API_KEY}`, a multipart `FormData` body carrying `file: { uri: fileUri, name: 'recording.m4a', type: 'audio/m4a' }`, `model_id` (verified per the Critical Implementation Details note above), and `language_code: 'en'`. On a non-2xx response, throws `SttApiError extends Error` carrying `.status`, mirroring `CalendarApiError`. On success, returns the response body's `text` field.

#### 2. Unit tests

**File**: `src/lib/voice-stt.test.ts` (new)

**Intent**: Cover the request shape and both success/error paths against a mocked `fetch`, following `google-calendar-api.test.ts`'s existing pattern exactly.

**Contract**: Mock global `fetch`; assert the request URL, `xi-api-key` header, and form fields; assert the resolved string equals the mocked `text` field; assert `SttApiError` is thrown on a non-2xx mock response.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- N/A for this phase — covered end-to-end in Phase 4's manual verification

---

## Phase 3: Transcript → structured event parser

### Overview

Turn a free-form transcript into the `DraftEvent` shape the existing calendar-creation logic already expects, using a forced tool-use call to Claude.

### Changes Required:

#### 1. Event parser

**File**: `src/lib/event-parser.ts` (new)

**Intent**: Extract `{title, startDateTime, durationMinutes}` from a transcript via Claude's Messages API, anchoring relative date/time phrases per the Critical Implementation Details note above.

**Contract**: `parseEventFromTranscript(transcript: string): Promise<DraftEvent>` (reusing the `DraftEvent` type from `google-calendar-api.ts`) — `POST https://api.anthropic.com/v1/messages` with headers `x-api-key: ${ANTHROPIC_API_KEY}`, `anthropic-version: 2023-06-01`, `content-type: application/json`; body specifies `model: 'claude-haiku-4-5-20251001'`, a single tool named `extract_event` whose `input_schema` matches `DraftEvent` (`startDateTime` described as requiring an explicit UTC offset), and `tool_choice: { type: 'tool', name: 'extract_event' }` to force structured output; the user message embeds the transcript plus the current ISO date/time and `Intl.DateTimeFormat().resolvedOptions().timeZone`. Parses the response's `tool_use` content block's `input` as the `DraftEvent`; throws `ParseError extends Error` if no `tool_use` block is present or a required field is missing.

#### 2. Unit tests

**File**: `src/lib/event-parser.test.ts` (new)

**Intent**: Cover the request shape and both success/failure parsing paths against a mocked `fetch`.

**Contract**: Mock global `fetch`; assert the request body includes the forced `tool_choice`, the embedded transcript, and the current date/time + time zone context; assert a mocked `tool_use` response maps to the expected `DraftEvent`; assert `ParseError` is thrown when the mocked response omits a `tool_use` block.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- N/A for this phase — covered end-to-end in Phase 4's manual verification

---

## Phase 4: Push-to-talk recording + screen rewrite

### Overview

Wire recording, transcription, parsing, and confirmation together behind a press-and-hold button, replacing the wake-word/ElevenLabs-session screen with the new pipeline while reusing the existing (unchanged) Google Calendar creation logic.

### Changes Required:

#### 1. Push-to-talk recorder

**File**: `src/lib/audio-recorder.ts` (new)

**Intent**: A thin hook wrapping `expo-audio`'s recorder lifecycle for push-to-talk, requesting microphone permission on first use.

**Contract**: `useVoiceRecorder(): { isRecording: boolean; start(): Promise<void>; stop(): Promise<string> }` — backed by `useAudioRecorder(RecordingPresets.HIGH_QUALITY)`; `start()` requests recording permission if not already granted, activates the recording audio session (per the Critical Implementation Details note above), then calls `prepareToRecordAsync()` and `record()`; `stop()` calls `recorder.stop()` and resolves with `recorder.uri`.

#### 2. Voice screen rewrite

**File**: `src/app/index.tsx`

**Intent**: Replace the wake-word/`ConversationProvider` body of `VoiceScreen` with a press-and-hold button driving record → transcribe → parse → on-screen confirm → create. Remove the `useWakeWordListener`/`WakeWordListener` import and all `@elevenlabs/react-native` usage (`ConversationProvider`, `useConversationControls`, `useConversationStatus`) — the top-level `ConversationProvider` wrapper in `HomeScreen` is removed entirely, since Google sign-in state alone now gates the screen.

**Contract**: A `ScreenPhase` union (`'idle' | 'recording' | 'transcribing' | 'parsing' | 'confirming' | 'creating'`) drives a status label (mirroring the existing glanceable-status-text pattern) and the button/confirm UI. Press-in on the button (while `signedIn` and `idle`) calls `start()`; press-out calls `stop()`, then `transcribeAudio(uri)`, then `parseEventFromTranscript(transcript)`, landing in `'confirming'` with the parsed `DraftEvent` shown on screen. Confirm calls the existing `handleCreateEventTool(draftEvent, onUnauthorized)` unchanged (including its existing 401 teardown behavior); Cancel discards the draft and returns to `'idle'` with no side effects. Any failure at the `'recording'`/`'transcribing'`/`'parsing'`/`'creating'` stage shows a single inline error message and returns to `'idle'` for a manual retry, per the agreed single-attempt error handling.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- End-to-end happy path on-device: hold button, dictate an event in plain English, release → parsed title/date/time shown → tap Confirm → event appears in Google Calendar within a few seconds → screen returns to idle
- Tapping Cancel on the confirm screen discards the draft; no event is created
- Dictating a time that conflicts with an existing event still surfaces the conflict description (via the existing, unchanged `handleCreateEventTool` behavior) before anything is created
- A simulated STT or parse failure (e.g. airplane mode) shows an inline error and returns to idle, and holding the button again retries successfully
- Revoking Calendar access (simulated 401) during event creation still triggers the existing sign-out teardown and returns the app to the sign-in screen
- The on-screen status stays glanceable (no dense text) throughout the pipeline

---

## Testing Strategy

### Unit Tests:

- `transcribeAudio`: correct multipart request shape and headers, returns the transcript, throws `SttApiError` on a non-2xx response
- `parseEventFromTranscript`: correct forced tool-use request shape including the current date/time + time zone context, maps a `tool_use` response to `DraftEvent`, throws `ParseError` when no `tool_use` block is present
- No changes needed to the existing `google-calendar-api.test.ts` / `create-event-tool.test.ts` — those modules are reused unchanged

### Integration Tests:

- None planned — the on-device recording/STT/LLM round trip is not practical to integration-test without hardware and live third-party APIs; covered instead by Phase 4's manual verification.

### Manual Testing Steps:

1. Fresh app launch, signed in: confirm the push-to-talk button is shown (no wake-word arming).
2. Full happy-path dictation → confirm → Calendar write, per Phase 4.
3. Cancel scenario: dictate an event, tap Cancel on the confirm screen, confirm nothing is created.
4. Conflict scenario: dictate an event overlapping an existing one; confirm the conflict is surfaced before creation.
5. Failure scenario: trigger an STT/parse failure (e.g. airplane mode); confirm the inline error and successful retry.
6. Revoked-access scenario: revoke Calendar access from the Google account settings, then trigger a create; confirm the 401 teardown path returns the app to the sign-in screen.

## Performance Considerations

Each event now takes two sequential network round trips (STT, then Claude) before the existing Calendar conflict-check/create round trip — more latency per event than the previous single hosted-agent session, but still acceptable for a personal MVP with no specified latency budget.

## Migration Notes

Greenfield rework of an already-shipped feature — no user data to migrate. `src/lib/wake-word.ts` is deleted; `google-calendar-api.ts`, `create-event-tool.ts`, and `use-google-calendar-session.ts` are reused unchanged.

## References

- Original feature plan (being reworked): `context/changes/voice-create-event/plan.md`, `context/changes/voice-create-event/plan-brief.md`
- ElevenLabs Speech-to-Text cookbook: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/speech-to-text
- ElevenLabs Speech-to-Text API reference: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
- ElevenLabs authentication docs: https://elevenlabs.io/docs/api-reference/authentication
- Expo Audio SDK 57 docs: https://docs.expo.dev/versions/v57.0.0/sdk/audio/
- Existing calendar client pattern (reused unchanged): `src/lib/google-calendar-api.ts:1-39`, `src/lib/create-event-tool.ts:1-39`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dependency cleanup, permissions & credentials

#### Automated

- [x] 1.1 Dependencies install cleanly: `npm install` — 5b848f6
- [x] 1.2 Type checking passes: `npx tsc --noEmit` — 5b848f6
- [x] 1.3 Linting passes: `npm run lint` — 5b848f6
- [x] 1.4 Existing tests still pass: `npm test` — 5b848f6

#### Manual

- [x] 1.5 `npx expo prebuild --clean && npm run ios` builds and launches a dev client successfully with LiveKit/Picovoice native modules gone and `expo-audio` linked — 5b848f6
- [x] 1.6 Launching the app on-device prompts for microphone permission with the updated description text — 5b848f6

### Phase 2: ElevenLabs Speech-to-Text client

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 5e5981f
- [x] 2.2 Type checking passes: `npx tsc --noEmit` — 5e5981f
- [x] 2.3 Linting passes: `npm run lint` — 5e5981f

### Phase 3: Transcript → structured event parser

#### Automated

- [x] 3.1 Unit tests pass: `npm test` — e33ca19
- [x] 3.2 Type checking passes: `npx tsc --noEmit` — e33ca19
- [x] 3.3 Linting passes: `npm run lint` — e33ca19

### Phase 4: Push-to-talk recording + screen rewrite

#### Automated

- [x] 4.1 Type checking passes: `npx tsc --noEmit` — 333ad3f
- [x] 4.2 Linting passes: `npm run lint` — 333ad3f

#### Manual

- [x] 4.3 End-to-end happy path on-device: hold button, dictate an event, release → parsed title/date/time shown → tap Confirm → event appears in Google Calendar within a few seconds → screen returns to idle — 333ad3f
- [x] 4.4 Tapping Cancel on the confirm screen discards the draft; no event is created — 333ad3f
- [x] 4.5 Dictating a time that conflicts with an existing event still surfaces the conflict description before anything is created — 333ad3f
- [x] 4.6 A simulated STT or parse failure shows an inline error and returns to idle, and retrying succeeds — 333ad3f
- [x] 4.7 Revoking Calendar access (simulated 401) during event creation still triggers the existing sign-out teardown — 333ad3f
- [x] 4.8 The on-screen status stays glanceable (no dense text) throughout the pipeline — 333ad3f
