# Voice Read Today Implementation Plan

## Overview

Add a second voice-driven flow to the app: the user taps a "What's on today?" button, the app fetches today's Google Calendar events, and speaks a concise summary out loud via ElevenLabs Text-to-Speech — closing FR-006/FR-007 (roadmap slice S-02), the other Primary Success Criterion from the PRD alongside the already-shipped create-event flow.

## Current State Analysis

The app has one screen (`src/app/index.tsx`, `VoiceScreen`) driven by a `ScreenPhase` state machine (`idle → recording → transcribing → parsing → confirming → creating`) for creating events: hold a button to record, ElevenLabs STT transcribes, Claude parses into a `DraftEvent`, the user confirms on-screen, and `handleCreateEventTool` writes to Google Calendar. `google-calendar-api.ts` already exposes `listUpcomingEvents` (unscoped "next 5", used only to verify a session is signed in) and `findConflictingEvents` (arbitrary time window), both following the same plain-`fetch` + typed-response + `*ApiError` convention. There is no day-scoped query, no text-to-speech anywhere in the app, and no audio-playback capability (`expo-audio` is currently used only for recording).

### Key Discoveries:

- `google-calendar-api.ts:56-84` (`findConflictingEvents`) is the closest existing pattern for a day-scoped query — same request shape, just needs local-midnight-to-midnight bounds instead of caller-supplied ones.
- `voice-config.ts` already holds `ELEVENLABS_API_KEY` as a placeholder constant reused across STT — the same key authorizes ElevenLabs' Text-to-Speech endpoint, so no new credential *provider* is needed, only a new placeholder constant for the voice ID.
- ElevenLabs TTS (`POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`, header `xi-api-key`, JSON body `{ text, model_id }`, recommended `model_id: eleven_multilingual_v2`) returns raw audio bytes, not a URI — `expo-audio`'s player only accepts URI/require sources, not Blob/ArrayBuffer, so the response must be written to a local file first.
- `expo-file-system` (v57.0.5) is already present in `node_modules` as a transitive dependency but not a direct one; its current (non-legacy) API is `new File(Paths.cache, name).write(uint8Array)`, giving a `file://` URI to hand to `expo-audio`.
- `expo-audio`'s `useAudioPlayer` hook takes its source at call time; since the TTS audio URI is only known after an async fetch resolves, the component must call `useAudioPlayer(null)` up front and `player.replace(uri)` once synthesis finishes — a load-bearing lifecycle detail (see Critical Implementation Details).
- `use-google-calendar-session.ts` and `create-event-tool.ts` both funnel a `CalendarApiError` with `status === 401` into `signOutLocally()` + a caller-supplied unauthorized callback — the same 401 teardown must be reused for the today-readout fetch.

## Desired End State

Signed in on the Home screen, the user sees two controls: the existing hold-to-talk "create event" button, and a new "What's on today?" button. Tapping the latter fetches today's Google Calendar events (local midnight to midnight, including all-day events), and ElevenLabs speaks a concise summary ("You have 3 events today: 9:00 AM Standup, 1:00 PM Dentist, 4:00 PM Team sync.", or "You have nothing on your calendar today." when empty). A "Stop" control is visible while speaking so the user can interrupt playback at any point. A revoked-access 401 during the fetch tears down the session the same way the create-event flow already does.

Verification: sign in, tap "What's on today?" with a mix of timed and all-day events on the calendar for today, and confirm the spoken summary matches; repeat with an empty day and confirm the "nothing today" message; tap Stop mid-speech and confirm playback halts and the screen returns to idle.

## What We're NOT Doing

- No changes to the existing create-event flow, its screen states, or `handleCreateEventTool` / `google-calendar-api.ts`'s existing functions.
- No intent classification from voice (e.g., inferring "read today" from a spoken transcript) — this is a dedicated on-screen button.
- No capping or truncation of long event lists — the Stop control is the safety mechanism, not a length limit.
- No reading of events beyond today (no "what's next", no multi-day range).
- No offline handling, retry/backoff logic, or Android support (matches existing scope for the voice features).
- No changes to the OAuth/session flow beyond reusing its existing 401 teardown callback.

## Implementation Approach

Extend `google-calendar-api.ts` with a new day-scoped query function and an `allDay` flag on `CalendarEvent`, add two small new `src/lib/` modules (a pure spoken-text formatter and an ElevenLabs TTS client) following the exact conventions the STT/parser/create-event modules already established, and wire a new button + two new `ScreenPhase` values into the existing `VoiceScreen` component. No new architecture — this reuses the same auth, error, and file-organization patterns as the shipped create-event flow.

## Critical Implementation Details

### Timing & lifecycle: dynamic TTS playback source

`useAudioPlayer` must be called with `null` at the top of `VoiceScreen` (its source can't be known until the async ElevenLabs fetch + file-write resolves). Once `synthesizeSpeech()` returns a local file URI, call `player.replace(uri)` then `player.play()`. Use `useAudioPlayerStatus(player)` and watch for `didJustFinish` to automatically return the screen to `idle` when speech ends naturally (as opposed to being stopped early).

## Phase 1: Dependencies & credentials

### Overview

Add the one new package this feature needs and a placeholder for the ElevenLabs voice ID, mirroring how `voice-config.ts` already holds `ELEVENLABS_API_KEY` / `ANTHROPIC_API_KEY`.

### Changes Required:

#### 1. Add `expo-file-system` as a direct dependency

**File**: `package.json`

**Intent**: Promote the already-present transitive `expo-file-system` to a direct dependency so the TTS client can import `File`/`Paths` from it explicitly.

**Contract**: Add `"expo-file-system": "~57.0.5"` to `dependencies`, matching the `~57.0.x` pinning convention already used for every other first-party Expo package in the file.

#### 2. Add the ElevenLabs voice ID placeholder

**File**: `src/lib/voice-config.ts`

**Intent**: Provide a single named place for the voice ID the TTS client will use, following the existing placeholder-constant pattern.

**Contract**: Add `export const ELEVENLABS_VOICE_ID = 'PLACEHOLDER_ELEVENLABS_VOICE_ID';` with a comment pointing at ElevenLabs' voice library (`https://elevenlabs.io/app/voice-library`) — same style as the existing API-key comments.

### Success Criteria:

#### Automated Verification:

- Dependencies install cleanly: `npm install`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- `expo-file-system`'s `File`/`Paths` exports are importable without a Metro bundling error.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Today-scoped Calendar API query

### Overview

Add a function that fetches exactly today's events (local midnight to midnight), flagging which ones are all-day, without touching the two existing query functions.

### Changes Required:

#### 1. Extend `CalendarEvent` and add `listTodayEvents`

**File**: `src/lib/google-calendar-api.ts`

**Intent**: Give the read-today flow a query scoped to the local calendar day, distinguishing all-day events (which have `start.date` but no `start.dateTime`) from timed ones, so the formatter in Phase 3 can speak them differently.

**Contract**: Add an optional `allDay?: boolean` field to the exported `CalendarEvent` type. Add `export async function listTodayEvents(accessToken: string): Promise<CalendarEvent[]>` that computes local-midnight `timeMin`/`timeMax` bounds (`new Date(y, m, d, 0, 0, 0, 0)` / `new Date(y, m, d, 23, 59, 59, 999)` off `new Date()`), issues the same `GET .../calendars/primary/events?...` request as `findConflictingEvents` (`singleEvents=true`, `orderBy=startTime`, no `maxResults` cap), and maps each item to `{ id, summary, start, allDay: item.start?.dateTime === undefined }` using the existing `CalendarEventsListResponse` type. Throws `CalendarApiError` on a non-2xx response, matching every other function in the file.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- N/A (pure API logic, fully covered by unit tests; exercised end-to-end in Phase 5).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Events → spoken-text formatter

### Overview

Add a pure function that turns a list of today's `CalendarEvent`s into the exact sentence ElevenLabs will speak.

### Changes Required:

#### 1. `formatTodayReadout`

**File**: `src/lib/today-readout.ts` (new)

**Intent**: Produce the spoken summary text as a single pure, easily-testable function, kept separate from the network/TTS code in Phase 4.

**Contract**: `export function formatTodayReadout(events: CalendarEvent[]): string`. Empty input returns `"You have nothing on your calendar today."`. Non-empty input returns `"You have {N} event{s} today: {list}."` where each list entry is `"{time} {summary}"` for timed events (time formatted via `toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })` on `new Date(event.start)`) or `"{summary}, all day"` for `allDay` events, joined with `", "`.

#### 2. Unit tests

**File**: `src/lib/today-readout.test.ts` (new)

**Intent**: Cover the branches that matter for correctness of what gets spoken.

**Contract**: Test cases for zero events, one timed event (singular "event"), multiple timed events (plural "events", correct join), and a mix including an all-day event (correct "all day" phrasing) — mirroring the `describe`/`it` structure of `google-calendar-api.test.ts`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- N/A (pure formatting logic, fully covered by unit tests).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: ElevenLabs TTS client + local playback file

### Overview

Add the network call that turns spoken-summary text into a locally-playable audio file, following the exact client conventions `voice-stt.ts` already set.

### Changes Required:

#### 1. `synthesizeSpeech`

**File**: `src/lib/voice-tts.ts` (new)

**Intent**: Convert text to speech via ElevenLabs and hand back a `file://` URI `expo-audio` can play, isolating the one genuinely new piece of I/O (network + filesystem) this feature needs.

**Contract**: `export class TtsApiError extends Error` (same `status`-carrying shape as `SttApiError`/`CalendarApiError`). `export async function synthesizeSpeech(text: string): Promise<string>` POSTs to `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}` with headers `{ 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' }` and body `{ text, model_id: 'eleven_multilingual_v2' }`; throws `TtsApiError` on a non-2xx response; on success, reads the response via `response.bytes()`, writes it with `new File(Paths.cache, \`today-readout-${Date.now()}.mp3\`).write(audioBytes)` (from `expo-file-system`'s `File`/`Paths`), and returns `file.uri`.

Per your testing-scope decision, this module does not get a dedicated unit test file (no mocked-network test), matching the "hardware/integration-adjacent" modules that stayed manual-only in the sibling voice slices.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`

#### Manual Verification:

- Calling `synthesizeSpeech` with a real API key and voice ID produces a non-empty local `.mp3` file (verified as part of Phase 5's end-to-end manual test, not standalone).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: UI integration — "What's on today?" button

### Overview

Wire the new query, formatter, and TTS client into `VoiceScreen`: a new button, two new screen phases, playback via `expo-audio`, and a Stop control.

### Changes Required:

#### 1. Extend the screen state machine and add the button

**File**: `src/app/index.tsx`

**Intent**: Add a second, independent control alongside the existing hold-to-talk button that drives today's-events fetch → speak, reusing the existing `session`/error/401-teardown plumbing.

**Contract**: Extend `type ScreenPhase` with `'fetchingToday' | 'speakingToday'`. Add a `useAudioPlayer(null)` instance and `useAudioPlayerStatus(player)` at the top of `VoiceScreen`; watch `status.didJustFinish` in a `useEffect` to reset `phase` to `'idle'` when speech ends naturally. Add a "What's on today?" `Pressable`, visible and enabled only when `session.state === 'signedIn' && phase === 'idle'`, whose handler: sets `phase` to `'fetchingToday'`, calls `listTodayEvents(session.accessToken)` (with the same `CalendarApiError` 401 handling as `handleCreateEventTool` — on 401, call `signOutLocally()`-equivalent via `session.forceSignOut()` and reset to idle; on other errors, set `pipelineError` and reset to idle), formats the result with `formatTodayReadout`, calls `synthesizeSpeech(summary)`, sets `phase` to `'speakingToday'`, calls `player.replace(uri)` then `player.play()`. While `phase === 'speakingToday'`, render a "Stop" `Pressable` that calls `player.pause()` and resets `phase` to `'idle'`. Disable/hide the existing create-event button while `phase` is `'fetchingToday'` or `'speakingToday'`, matching the existing mutual-exclusion pattern already used for the create-event phases.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx tsc --noEmit`
- Linting passes: `npm run lint`
- Existing tests still pass: `npm test`

#### Manual Verification:

- Tapping "What's on today?" on a day with a mix of timed and all-day events speaks an accurate summary matching what's on the calendar.
- Tapping it on an empty day speaks "You have nothing on your calendar today."
- Tapping "Stop" mid-speech halts playback immediately and returns the screen to idle (create-event button re-enabled).
- Letting a readout finish naturally returns the screen to idle without needing Stop.
- Revoking Calendar access and tapping "What's on today?" tears down the session the same way the existing create-event 401 path does (returns to the sign-in screen).
- The two buttons never both accept input at the same time (starting one disables the other).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `listTodayEvents`: correct local-day `timeMin`/`timeMax` bounds, correct `allDay` mapping for date-only vs dateTime items, empty-result handling, `CalendarApiError` on non-2xx.
- `formatTodayReadout`: empty day, one event (singular), multiple events (plural + join), all-day event phrasing.

### Integration Tests:

- None — this slice has no integration/E2E test infrastructure, matching the sibling voice slices.

### Manual Testing Steps:

1. Sign in, ensure today's Google Calendar has 2-3 timed events and one all-day event, tap "What's on today?", verify the spoken summary lists all of them correctly.
2. Clear today's calendar, tap "What's on today?", verify it speaks "You have nothing on your calendar today."
3. Tap "What's on today?" again and tap "Stop" partway through speech; verify playback halts immediately and the screen returns to idle.
4. Revoke the app's Google Calendar access (e.g., via Google Account settings) and tap "What's on today?"; verify the app signs out and returns to the sign-in screen.

## Performance Considerations

Each tap does two sequential network round-trips (Calendar list, then ElevenLabs synthesis) before audio starts — no caching or pre-fetching is in scope for this MVP slice; the existing `ActivityIndicator` pattern from the create-event flow should be reused during `fetchingToday` to signal the wait.

## Migration Notes

None — additive feature, no existing data or schema changes.

## References

- Related roadmap slice: `context/foundation/roadmap.md` (S-02: `voice-read-today`, FR-006/FR-007)
- Existing day-window query pattern: `src/lib/google-calendar-api.ts:56-84` (`findConflictingEvents`)
- Existing 401 teardown pattern: `src/lib/create-event-tool.ts:30-37`
- Existing screen state machine: `src/app/index.tsx:19-72`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dependencies & credentials

#### Automated

- [x] 1.1 Dependencies install cleanly: `npm install` — 73a9c0c
- [x] 1.2 Type checking passes: `npx tsc --noEmit` — 73a9c0c
- [x] 1.3 Linting passes: `npm run lint` — 73a9c0c

#### Manual

- [x] 1.4 `expo-file-system`'s `File`/`Paths` exports are importable without a Metro bundling error. — 73a9c0c

### Phase 2: Today-scoped Calendar API query

#### Automated

- [x] 2.1 Unit tests pass: `npm test` — 11640b5
- [x] 2.2 Type checking passes: `npx tsc --noEmit` — 11640b5
- [x] 2.3 Linting passes: `npm run lint` — 11640b5

### Phase 3: Events → spoken-text formatter

#### Automated

- [x] 3.1 Unit tests pass: `npm test` — d17f7ea
- [x] 3.2 Type checking passes: `npx tsc --noEmit` — d17f7ea
- [x] 3.3 Linting passes: `npm run lint` — d17f7ea

### Phase 4: ElevenLabs TTS client + local playback file

#### Automated

- [x] 4.1 Type checking passes: `npx tsc --noEmit` — c143c7b
- [x] 4.2 Linting passes: `npm run lint` — c143c7b

#### Manual

- [ ] 4.3 Calling `synthesizeSpeech` with a real API key and voice ID produces a non-empty local `.mp3` file.

### Phase 5: UI integration — "What's on today?" button

#### Automated

- [x] 5.1 Type checking passes: `npx tsc --noEmit`
- [x] 5.2 Linting passes: `npm run lint`
- [x] 5.3 Existing tests still pass: `npm test`

#### Manual

- [ ] 5.4 Mixed timed + all-day events on today speak an accurate summary.
- [ ] 5.5 Empty day speaks "You have nothing on your calendar today."
- [ ] 5.6 Stop mid-speech halts playback immediately and returns to idle.
- [ ] 5.7 A readout finishing naturally returns to idle without Stop.
- [ ] 5.8 Revoked Calendar access during the fetch tears down the session like the existing create-event 401 path.
- [ ] 5.9 The two buttons are mutually exclusive while either flow is active.
