# Voice Create Event Implementation Plan

## Overview

Implement the roadmap's north-star slice (S-01): a hands-free flow where a custom wake word arms a live ElevenLabs Conversational AI voice session (bundled STT + LLM + TTS), the agent dictates and reads back a calendar event, and — only after the user confirms out loud — a client-side tool checks for scheduling conflicts and writes the event to the user's Google Calendar via the OAuth access token already wired up in the `google-calendar-oauth` change.

## Current State Analysis

The app is a single-user, iOS-only Expo (SDK 57) app with Google Calendar OAuth already working end-to-end (`google-calendar-oauth`, merged). Nothing voice-related exists yet: no audio/STT/TTS/NLP libraries, no microphone permission, no test framework. The Home tab currently shows a throwaway OAuth-verification screen that its own plan-brief explicitly earmarked for replacement by this slice.

### Key Discoveries:

- `src/lib/google-calendar-auth.ts:42-49` — `getAccessToken()` returns a valid, auto-refreshing token; the granted scope (`calendar.events`, `google-calendar-auth.ts:11`) already covers writing events — no new OAuth consent needed.
- `src/lib/google-calendar-api.ts:1-39` — established client pattern: exported domain `type`, a `CalendarApiError extends Error` carrying `.status`, a plain-`fetch` async function. Only `listUpcomingEvents` exists; no create/insert function yet.
- `src/app/index.tsx:17-74` — established screen pattern: string-union `ScreenState`, a mount `useEffect` doing configure → silent sign-in → get token, and a documented 401 rule: call `signOutLocally()` **before** resetting UI to `signedOut` (`plan.md:50-52` of the OAuth change) to avoid a stale-session sign-in loop. Non-401 errors must NOT force sign-out.
- `src/components/app-tabs.tsx` — tabs-only navigation (`NativeTabs`, Home + Explore triggers), no stack/modal navigator exists anywhere in the app.
- `app.json:28-44` — plugin array pattern for native modules (`google-signin` plugin takes an `iosUrlScheme` config object); no `ios.infoPlist` block exists yet, so no microphone permission string is configured.
- `package.json` — no test runner, no `expo-audio`/`expo-speech`/STT/NLP/AI dependency exists; this feature introduces all voice-related dependencies from scratch.
- Expo SDK 57's own audio/speech modules (`expo-audio`, `expo-speech`) provide recording and TTS only — no built-in STT — confirming that either a third-party STT engine or a hosted conversational-AI product is required; this plan uses the latter (ElevenLabs) so no separate STT/TTS integration is needed at all.
- ElevenLabs Conversational AI's official React Native SDK (`@elevenlabs/react-native`, backed by LiveKit WebRTC) bundles STT+LLM+TTS into one session, supports custom client-callable tools, and requires a custom dev client (`Expo Go` unsupported) — already true for this app because of the Google Sign-In native module.
- Picovoice Porcupine's React Native SDK (`@picovoice/porcupine-react-native` + `@picovoice/react-native-voice-processor`) supports fully custom wake words authored in the Picovoice Console and bundled as a `.ppn` file; it also requires a custom dev client and its own `AccessKey`.

## Desired End State

With the app open and already signed in to Google Calendar, the Home screen arms wake-word listening automatically. The user says the configured wake word; the app starts an ElevenLabs voice session. The user dictates an event; the agent reads back title/date/time and asks for verbal confirmation. On a spoken "yes," the app's `create_event` tool handler checks for conflicting events and, if clear, creates the event in Google Calendar (visible within a few seconds); if a conflict exists, the tool handler reports that back so the agent can voice it and ask the user to confirm anyway or cancel. On "no," the agent does not call the tool and the session continues per its own dialogue configuration. After the session ends (success, cancel, or error), wake-word listening resumes automatically. A revoked-access 401 during the tool call ends the active session, stops wake-word listening, and returns the user to the existing sign-in screen.

**Verification:** run through the phase Success Criteria below; the end-to-end manual test in Phase 4 is the authoritative check that the whole loop works on-device.

## What We're NOT Doing

- Background/backgrounded wake-word listening (Maps/Music in front) — foreground-only for this MVP.
- Live transcript/captions UI during a session — status-only screen (e.g. "Listening…" / "Confirm?").
- A stack/modal navigator — the flow replaces the Home tab screen directly.
- Android support — the OAuth foundation is iOS-only; this slice stays iOS-only to match.
- App Store distribution / EAS build / GitHub Actions — parked by the roadmap; local dev client only.
- Offline handling, retry-with-correction dialogue design, or any change to the agent's actual confirm/no-handling dialogue logic beyond ensuring the confirm-before-tool-call gate exists — those are the agent's own conversational design, owned in the ElevenLabs dashboard, not this repo.
- Reading today's calendar or deleting events (S-02, S-03 — separate roadmap slices).
- Multi-account / shared calendars (PRD non-goal).

## Implementation Approach

Keep all new business logic (Calendar write + conflict check) as plain, unit-testable functions in `src/lib/`, following the existing `google-calendar-api.ts` conventions exactly. Treat ElevenLabs and Picovoice as thin wrappers around vendor SDKs rather than building custom STT/NLU/TTS — this is what makes the 3-week timeline realistic. Keep the two audio-owning systems (Porcupine wake-word listener, ElevenLabs session) mutually exclusive and explicitly handed off, since iOS gives one process ownership of the microphone at a time.

## Critical Implementation Details

**Tool contract is the seam between two different systems.** The ElevenLabs agent's tool schema is configured in the ElevenLabs dashboard (Phase 5, non-code) while the handler that receives the call is written in this repo (Phase 4). Per ElevenLabs' own docs, tool and parameter names are case-sensitive and must match exactly. This plan fixes the contract as: tool name `create_event`, parameters `{ title: string, startDateTime: string (ISO 8601 with offset, e.g. "2026-08-23T15:00:00-07:00"), durationMinutes?: number }` (omitted duration defaults to 60 in the handler). Phase 4 and Phase 5 must both be implemented against this exact contract.

**Audio session hand-off between Porcupine and ElevenLabs.** Both the wake-word listener and the ElevenLabs LiveKit session want exclusive use of the microphone. Porcupine's voice processor must be fully stopped before `Conversation.startSession(...)` is called, and restarted only after the session's disconnect/error callback fires — not immediately after invoking `startSession`, since the session is asynchronous. Running both concurrently risks a silent audio-session conflict on iOS rather than a clean error.

**Anchoring relative dates.** The agent has no inherent notion of "today" or the device's time zone. Pass the current local date/time and IANA time zone into the ElevenLabs session as context/dynamic variables at session start, and have the `create_event` tool's `startDateTime` always carry an explicit UTC offset — otherwise phrases like "tomorrow at 3pm" have no anchor and Google Calendar's `dateTime` field would be ambiguous.

**401 mid-session.** The existing OAuth 401 rule (`signOutLocally()` before resetting UI state) still applies, but now a 401 can surface from inside an active tool call mid-conversation. When the Calendar API call in the `create_event` handler returns a `CalendarApiError` with `status === 401`, the handler must both return an error result to the agent (so it can end the turn gracefully) and trigger tearing down the active ElevenLabs session and the wake-word listener before transitioning the screen to `signedOut` — leaving either running past a forced sign-out would leave the mic in an inconsistent state.

## Phase 1: Dependencies, permissions & embedded credentials

### Overview

Bring in every new native dependency this feature needs, wire up the required iOS permission, add embedded (client-side) API credentials following the existing OAuth precedent, and set up the test runner that Phase 2's unit tests need.

### Changes Required:

#### 1. Package dependencies

**File**: `package.json`

**Intent**: Add the ElevenLabs Conversational AI SDK and its LiveKit peer dependencies, the Picovoice Porcupine wake-word SDK and its voice-processor peer dependency, and a Jest-based test runner.

**Contract**: Dependencies: `@elevenlabs/react-native`, `@livekit/react-native`, `@livekit/react-native-webrtc`, `livekit-client`, `@picovoice/porcupine-react-native`, `@picovoice/react-native-voice-processor`. Dev dependencies: `jest-expo`, `jest`, `@types/jest`. Add a `"test": "jest --watchAll"` script and a `"jest": { "preset": "jest-expo" }` block, matching Expo's current documented unit-testing setup.

#### 2. iOS microphone permission & config plugins

**File**: `app.json`

**Intent**: Declare the microphone usage description iOS requires before any mic-based library can request access, and register any config plugins the new native modules need (mirroring the existing `google-signin` plugin entry).

**Contract**: Add `ios.infoPlist.NSMicrophoneUsageDescription` with a user-facing string explaining hands-free event creation. Add config plugin entries for `@elevenlabs/react-native` / `@picovoice/porcupine-react-native` if their setup docs specify one at implementation time (follow their current published integration instructions — do not assume a shape not yet confirmed).

#### 3. Embedded credentials

**File**: `src/lib/voice-config.ts` (new)

**Intent**: Hold the ElevenLabs API key + Agent ID and the Picovoice AccessKey as hardcoded literals, mirroring the `IOS_CLIENT_ID`/`WEB_CLIENT_ID` pattern already established in `google-calendar-auth.ts:3-4` for this single-user, no-backend app.

**Contract**: Exports `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `PICOVOICE_ACCESS_KEY` as string constants.

#### 4. Custom wake word asset

**File**: iOS bundled resource (path determined by Porcupine's iOS integration docs at implementation time)

**Intent**: Author a custom wake-word keyword in the Picovoice Console and bundle the resulting `.ppn` model file into the iOS app per Porcupine's current integration instructions.

**Contract**: The wake word triggers the same detection callback Phase 3 wires up.

### Success Criteria:

#### Automated Verification:

- [ ] Dependencies install cleanly: `npm install`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`
- [ ] Test runner is wired and runs (even with zero tests yet): `npm test -- --watchAll=false`

#### Manual Verification:

- [ ] `npx expo prebuild --clean && npm run ios` builds and launches a dev client successfully with the new native modules linked
- [ ] Launching the app on-device prompts for microphone permission with the configured description text

---

## Phase 2: Google Calendar create-event API + conflict check

### Overview

Add the one piece of this feature that is pure, hardware-independent logic and the highest-consequence code in the slice: writing to the user's real calendar, gated by a conflict check.

### Changes Required:

#### 1. Draft event type, create function, and conflict check

**File**: `src/lib/google-calendar-api.ts`

**Intent**: Add a function that creates an event via the Calendar API's `events.insert` endpoint, and a function that looks up whether any existing event overlaps a proposed time range — reusing the same list-events request shape `listUpcomingEvents` already uses. Follow the file's existing conventions exactly: a domain `type` for the input shape, the existing `CalendarApiError` for failures, `fetch`-based implementation.

**Contract**:
- `type DraftEvent = { title: string; startDateTime: string; durationMinutes?: number }` (defaults to 60 when omitted, per the Critical Implementation Details tool contract).
- `findConflictingEvents(accessToken: string, startDateTime: string, endDateTime: string): Promise<CalendarEvent[]>` — returns any existing events overlapping the given range (empty array if none).
- `createEvent(accessToken: string, event: DraftEvent): Promise<CalendarEvent>` — `POST https://www.googleapis.com/calendar/v3/calendars/primary/events` with a JSON body carrying `summary`, `start.dateTime`/`start.timeZone`, `end.dateTime`/`end.timeZone` (end computed from `durationMinutes`); throws `CalendarApiError` on non-2xx, matching `listUpcomingEvents`'s error handling.

#### 2. Tool handler orchestrating conflict-check + create

**File**: `src/lib/create-event-tool.ts` (new)

**Intent**: The function ElevenLabs' `clientTools.create_event` will call directly (wired in Phase 4). It orchestrates: get the current access token, check for conflicts, and either create the event or return a conflict description instead of creating it — matching the `create_event` tool contract fixed in Critical Implementation Details.

**Contract**: `handleCreateEventTool(params: { title: string; startDateTime: string; durationMinutes?: number }): Promise<string>` — returns a short natural-language result string for the agent to relay (e.g. a success confirmation, a conflict description naming the overlapping event, or an error description). On a `CalendarApiError` with `status === 401`, additionally performs the teardown described in Critical Implementation Details before returning its error string.

#### 3. Unit tests

**File**: `src/lib/google-calendar-api.test.ts`, `src/lib/create-event-tool.test.ts` (new)

**Intent**: Cover the logic identified in the complexity-questioning as needing automated coverage: happy-path creation, a detected conflict, and an API failure (including the 401 teardown path), all against a mocked `fetch`.

**Contract**: Mock global `fetch`; assert on the request shape sent to Google's API and on the returned/thrown values for each case.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm test -- --watchAll=false`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] N/A for this phase — covered end-to-end in Phase 4's manual verification

---

## Phase 3: Wake-word listener (Porcupine)

### Overview

Foreground-only, auto-arming wake-word detection that will trigger the voice session in Phase 4.

### Changes Required:

#### 1. Wake-word listener module

**File**: `src/lib/wake-word.ts` (new)

**Intent**: Wrap Porcupine's start/stop lifecycle behind a small hook/module so Phase 4's screen can arm listening on mount and stop it before starting an ElevenLabs session, per the audio hand-off rule in Critical Implementation Details.

**Contract**: Exposes a `useWakeWordListener(onWake: () => void): { start(): Promise<void>; stop(): Promise<void> }`-shaped hook (or equivalent), initialized with `PICOVOICE_ACCESS_KEY` and the bundled custom keyword file from Phase 1, requesting microphone permission on first `start()` if not already granted.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] Opening the app's Home screen (signed in) begins wake-word listening automatically, with no additional tap
- [ ] Saying the configured wake word fires the `onWake` callback reliably in a quiet room
- [ ] Backgrounding the app stops draining the mic/battery unexpectedly (foreground-only scope holds)

---

## Phase 4: ElevenLabs session + tool wiring + screen replacement

### Overview

Wire wake-word detection to an ElevenLabs voice session with the `create_event` client tool registered, replace the throwaway OAuth screen with the real voice-create flow, and implement the minimal status-only UI and the 401/error handling paths.

### Changes Required:

#### 1. Shared sign-in hook (extracted from the existing screen)

**File**: `src/hooks/use-google-calendar-session.ts` (new)

**Intent**: Relocate the existing mount-effect logic from `src/app/index.tsx:43-58` (configure → silent sign-in → get token, with the documented 401 rule) into a reusable hook, so the new voice screen can reuse it exactly instead of duplicating it inline.

**Contract**: Returns the same `ScreenState` union (`'loading' | 'signedOut' | 'signedIn'`) plus the current access token and the `handleConnect`/error-handling behavior already implemented in `index.tsx`, unchanged in behavior.

#### 2. Voice screen replacing Home

**File**: `src/app/index.tsx`

**Intent**: Replace the throwaway OAuth-verification screen with the voice-create-event flow: while `signedIn`, arm the Phase 3 wake-word listener; on wake, stop the listener and start an ElevenLabs session with the `create_event` client tool registered to `handleCreateEventTool`; show a minimal status indicator per the UI decision (e.g. idle/listening-for-wake-word, session-active, confirm-pending); on session end (success, error, or disconnect), resume the wake-word listener. While `signedOut`, keep the existing connect UI.

**Contract**: `Conversation.startSession({ agentId: ELEVENLABS_AGENT_ID, clientTools: { create_event: handleCreateEventTool } , /* current date/time + IANA time zone passed as session context per Critical Implementation Details */ })`. On the session's disconnect/error event, call the wake-word listener's `start()` again. On a 401 surfaced through `handleCreateEventTool`'s teardown, end the active session, stop the listener, and transition to `signedOut` via the shared hook.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] End-to-end happy path on-device: wake word → dictate an event → agent reads it back → say "yes" → event appears in Google Calendar within a few seconds → app returns to wake-word listening
- [ ] Saying "no" to the read-back does not create an event
- [ ] Dictating a time that conflicts with an existing event causes the agent to voice the conflict before creating anything
- [ ] Revoking Calendar access (simulated 401) mid-session ends the session, stops wake-word listening, and returns to the sign-in screen
- [ ] The on-screen status stays glanceable (no dense text) throughout a session

---

## Phase 5: ElevenLabs agent dashboard configuration (non-code)

### Overview

Verify or update the ElevenLabs agent's own system prompt and tool schema — configured outside this repo — so the safety-critical confirm-before-create behavior required by FR-004 is guaranteed, and so the tool schema exactly matches the contract fixed in Critical Implementation Details.

### Changes Required:

#### 1. Agent system prompt and tool schema

**File**: ElevenLabs dashboard (agent identified by `ELEVENLABS_AGENT_ID`) — not part of this repo

**Intent**: Ensure the agent's system prompt instructs it to always read back the parsed title/date/time and explicitly ask for confirmation before calling `create_event`, and never to call the tool on a "no" or ambiguous reply. Ensure the agent's tool definition for `create_event` has parameters named and typed exactly `title: string`, `startDateTime: string`, `durationMinutes: number` (optional) — case-sensitive, per the tool contract in Critical Implementation Details.

**Contract**: Tool name and parameter names/types must match Phase 2's `handleCreateEventTool` signature exactly.

### Success Criteria:

#### Automated Verification:

- N/A — this phase has no code to verify automatically.

#### Manual Verification:

- [ ] A test conversation confirms the agent always reads back and waits for a spoken confirmation before it calls `create_event`
- [ ] A test conversation where the user says "no" confirms the tool is never called
- [ ] The configured tool's parameter names/types match the Phase 2 handler exactly (a mismatch would fail silently per ElevenLabs' case-sensitive matching)

---

## Testing Strategy

### Unit Tests:

- `createEvent` happy path: correct request shape, returns mapped `CalendarEvent`
- `findConflictingEvents`: returns overlapping events, returns empty array when none
- `handleCreateEventTool`: creates when clear, returns a conflict description when not, returns an error string on API failure, performs the 401 teardown

### Integration Tests:

- None planned — the voice session, wake-word detection, and third-party agent behavior are not practical to integration-test without hardware and a live hosted agent; covered instead by the Phase 4/5 manual verification.

### Manual Testing Steps:

1. Fresh app launch, signed in: confirm wake-word listening arms automatically.
2. Full happy-path dictation → confirm → Calendar write, per Phase 4.
3. Conflict scenario: dictate an event overlapping an existing one; confirm the agent voices the conflict.
4. Rejection scenario: say "no" to the read-back; confirm no event is created.
5. Revoked-access scenario: revoke Calendar access from the Google account settings, then trigger a create; confirm the 401 teardown path returns the app to the sign-in screen.

## Performance Considerations

The ElevenLabs round trip (audio → STT → LLM → TTS) adds real network latency to each conversational turn; no specific latency budget was requested and none is set here — acceptable for a personal MVP per the PRD's scope.

## Migration Notes

None — greenfield feature, no existing data or users to migrate.

## References

- OAuth foundation: `context/changes/google-calendar-oauth/plan.md`, `context/changes/google-calendar-oauth/plan-brief.md`
- Roadmap slice: `context/foundation/roadmap.md` (S-01)
- PRD requirements: `context/foundation/prd.md` (US-01, FR-001–FR-005)
- Existing Calendar client pattern: `src/lib/google-calendar-api.ts:1-39`
- Existing OAuth screen pattern: `src/app/index.tsx:17-74`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dependencies, permissions & embedded credentials

#### Automated

- [x] 1.1 Dependencies install cleanly: `npm install`
- [x] 1.2 Type checking passes: `npx tsc --noEmit`
- [x] 1.3 Linting passes: `npm run lint`
- [x] 1.4 Test runner is wired and runs (even with zero tests yet): `npm test -- --watchAll=false`

#### Manual

- [x] 1.5 `npx expo prebuild --clean && npm run ios` builds and launches a dev client successfully with the new native modules linked
- [ ] 1.6 Launching the app on-device prompts for microphone permission with the configured description text (deferred — no code requests mic access until Phase 3's wake-word listener)

### Phase 2: Google Calendar create-event API + conflict check

#### Automated

- [ ] 2.1 Unit tests pass: `npm test -- --watchAll=false`
- [ ] 2.2 Type checking passes: `npx tsc --noEmit`
- [ ] 2.3 Linting passes: `npm run lint`

### Phase 3: Wake-word listener (Porcupine)

#### Automated

- [ ] 3.1 Type checking passes: `npx tsc --noEmit`
- [ ] 3.2 Linting passes: `npm run lint`

#### Manual

- [ ] 3.3 Opening the app's Home screen (signed in) begins wake-word listening automatically, with no additional tap
- [ ] 3.4 Saying the configured wake word fires the `onWake` callback reliably in a quiet room
- [ ] 3.5 Backgrounding the app stops draining the mic/battery unexpectedly (foreground-only scope holds)

### Phase 4: ElevenLabs session + tool wiring + screen replacement

#### Automated

- [ ] 4.1 Type checking passes: `npx tsc --noEmit`
- [ ] 4.2 Linting passes: `npm run lint`

#### Manual

- [ ] 4.3 End-to-end happy path on-device: wake word → dictate an event → agent reads it back → say "yes" → event appears in Google Calendar within a few seconds → app returns to wake-word listening
- [ ] 4.4 Saying "no" to the read-back does not create an event
- [ ] 4.5 Dictating a time that conflicts with an existing event causes the agent to voice the conflict before creating anything
- [ ] 4.6 Revoking Calendar access (simulated 401) mid-session ends the session, stops wake-word listening, and returns to the sign-in screen
- [ ] 4.7 The on-screen status stays glanceable (no dense text) throughout a session

### Phase 5: ElevenLabs agent dashboard configuration (non-code)

#### Manual

- [ ] 5.1 A test conversation confirms the agent always reads back and waits for a spoken confirmation before it calls `create_event`
- [ ] 5.2 A test conversation where the user says "no" confirms the tool is never called
- [ ] 5.3 The configured tool's parameter names/types match the Phase 2 handler exactly (a mismatch would fail silently per ElevenLabs' case-sensitive matching)
