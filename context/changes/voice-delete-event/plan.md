# Voice Delete Event Implementation Plan

## Overview

Add the third and final voice-CRUD slice (S-03 on the roadmap): the user can press-and-hold a new button, describe which calendar event to delete, review a matched event on screen, and confirm before it's permanently removed from Google Calendar. This reuses the exact push-to-talk → transcribe → parse → confirm → commit pipeline already built for `voice-create-event`, adding a search step in between parse and confirm since (unlike create) the app must first locate the real event the user means.

## Current State Analysis

The app (`src/app/index.tsx`, `VoiceScreen`) already implements two voice flows on a single screen:

- **Create** (hold "Hold to create an event" → release → `transcribeAudio` (ElevenLabs STT) → `parseEventFromTranscript` (Claude Haiku tool-use, `src/lib/event-parser.ts`) → text-only Confirm/Cancel screen → `handleCreateEventTool` (conflict check + `createEvent`, `src/lib/create-event-tool.ts`)).
- **Read today** (tap "What's on today?" → `listTodayEvents` → `formatTodayReadout` → `synthesizeSpeech` (ElevenLabs TTS) → local audio playback with a Stop control).

`google-calendar-api.ts` has no search-by-keyword and no delete endpoint. There is no `delete-event-tool.ts` yet. `event-parser.ts` has one Anthropic tool (`extract_event`) and no delete-target extraction.

The codebase has already deviated once from the PRD's literal "reads back... by voice" wording (FR-004): the create-event confirm screen is text-only, not spoken. This plan follows that same established precedent for delete's confirm step, per the questions answered during planning.

### Key Discoveries:

- `google-calendar-api.ts:22-29` (`CalendarApiError`) and every existing query function share one convention: build a `URLSearchParams`, `fetch` against `https://www.googleapis.com/calendar/v3/calendars/primary/events...`, throw `CalendarApiError` on `!response.ok`, map the typed JSON response. New functions must follow this exactly.
- `create-event-tool.ts:4-38` (`handleCreateEventTool`) is the template for tool-handler shape: fetch `getAccessToken()` internally, try/catch, on `CalendarApiError` with `status === 401` call `signOutLocally()` + `onUnauthorized?.()`, otherwise return a plain-English error string — never throw out of the handler.
- `event-parser.ts:37-86` (`parseEventFromTranscript`) is the template for Claude tool-use parsing: force `tool_choice: { type: 'tool', name: ... }`, pass current date/time + resolved IANA timezone as context, extract from the single `tool_use` content block, throw `ParseError` if missing.
- Window/business logic (e.g. computing an event's end time from `durationMinutes`) lives in the `*-tool.ts` files, not in `google-calendar-api.ts` — the API layer only exposes generic, caller-supplied-window queries (`findConflictingEvents(token, start, end)`) or one named convenience query (`listTodayEvents`, which owns its own midnight-to-midnight math). This plan's search window logic belongs in `delete-event-tool.ts`.
- `VoiceScreen`'s `ScreenPhase` union and per-flow state (`draft`, `pipelineError`, `resultMessage`) is the established pattern for adding a new flow to this screen — each flow gets its own phase names and its own confirm-block JSX gated on `phase === '<flow>Confirming'`.
- Testing convention across all three `*.test.ts` files: mock `global.fetch` directly for API-layer tests (`google-calendar-api.test.ts`), mock the imported module for tool-handler tests (`create-event-tool.test.ts` uses `jest.mock('./google-calendar-api', ...)`). No tests exist for `VoiceScreen` itself — UI wiring stays manual-only.

## Desired End State

Signed in, the user presses and holds a new "Hold to delete an event" button, says which event to remove (optionally naming a day), and releases. The app transcribes, extracts a search query (+ optional date hint), searches Google Calendar for a match, and shows a Confirm/Cancel screen with the matched event's title and time — noting when more than one event matched. Tapping Confirm deletes that event from Google Calendar and returns to idle with a result message; Cancel discards it with no calendar change. A revoked-access 401 at any point in the flow tears down the session exactly like the existing flows.

**Verification:** `npm test` passes with new unit tests for the API, parser, and tool-handler layers; manual verification confirms the end-to-end voice flow against a real Google Calendar.

## What We're NOT Doing

- No selectable candidate list UI — disambiguation is handled by auto-picking the closest (soonest) match and showing it plainly on the existing confirm screen.
- No extra confirmation friction beyond the existing single Confirm/Cancel tap (no hold-to-confirm gesture, no second spoken confirmation round-trip).
- No spoken (TTS) read-back of the matched event — the confirm screen stays text-only, matching create-event's existing behavior.
- No client-side keyword/fuzzy matching logic — search relies on Google Calendar API's native `q` parameter.
- No changes to the create-event or read-today flows.
- No Android, no App Store/EAS distribution changes.
- No deletion beyond the single matched event (no bulk/recurring-series delete handling).

## Implementation Approach

Three new pieces of business logic slot in alongside the existing ones, following each one's established file and convention exactly:

1. `google-calendar-api.ts` gains `searchEvents` (generic `q`-parameterized query, caller supplies the time window) and `deleteEvent` (DELETE by event ID).
2. `event-parser.ts` gains `parseDeleteTargetFromTranscript`, a second Claude Haiku tool-use call extracting `{ searchQuery, dateHint? }` from the transcript.
3. A new `delete-event-tool.ts` owns the delete-specific business logic: resolving the search time window (the mentioned day if `dateHint` is present, otherwise a rolling 30-day-forward window from now), calling `searchEvents`, picking the soonest match, and exposing the final commit call (`handleDeleteEventTool`) that actually deletes.

`VoiceScreen` wires these together with a third dedicated button (not intent classification — matching the app's established preference for explicit controls) and a parallel set of `ScreenPhase` values for the delete flow, alongside a new `deleteTarget` state analogous to `draft`.

## Phase 1: Calendar API additions — search and delete

### Overview

Add the two new Google Calendar API operations this feature needs, following the exact conventions already used by every function in `google-calendar-api.ts`.

### Changes Required:

#### 1. `searchEvents` query function

**File**: `src/lib/google-calendar-api.ts`

**Intent**: A generic, caller-windowed search over the primary calendar using Google's native full-text `q` parameter, so delete-target disambiguation doesn't need any client-side keyword matching.

**Contract**: `searchEvents(accessToken: string, query: string, timeMin: string, timeMax: string): Promise<CalendarEvent[]>`. Builds `URLSearchParams` with `q`, `timeMin`, `timeMax`, `singleEvents: 'true'`, `orderBy: 'startTime'` against the same `.../calendars/primary/events` endpoint as `findConflictingEvents`/`listTodayEvents`; throws `CalendarApiError` on `!response.ok`; maps the response items the same way (`id`, `summary ?? '(no title)'`, `start.dateTime ?? start.date ?? ''`). Results are ordered soonest-first by construction (`orderBy: 'startTime'`), which the caller in Phase 3 relies on to auto-pick the closest match.

#### 2. `deleteEvent` mutation function

**File**: `src/lib/google-calendar-api.ts`

**Intent**: Permanently delete a single event by ID from the primary calendar.

**Contract**: `deleteEvent(accessToken: string, eventId: string): Promise<void>`. `fetch` with `method: 'DELETE'` against `.../calendars/primary/events/${eventId}` with the `Authorization` header; throws `CalendarApiError` on `!response.ok` (same convention as every other function — no special-casing of any particular status code). No response body to parse.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm test -- google-calendar-api.test.ts`
- [ ] Full test suite passes: `npm test`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] N/A for this phase — verified end-to-end in Phase 4

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Delete-target voice parsing

### Overview

Add a second Claude Haiku tool-use call that extracts what the user meant to delete from their spoken transcript, mirroring `parseEventFromTranscript` exactly.

### Changes Required:

#### 1. `parseDeleteTargetFromTranscript`

**File**: `src/lib/event-parser.ts`

**Intent**: Turn a spoken deletion request ("delete my dentist appointment tomorrow") into a structured search query the delete-lookup logic can run against Google Calendar.

**Contract**: Exports a `DeleteSearchQuery` type: `{ searchQuery: string; dateHint?: string }`, where `dateHint` is an ISO 8601 date (`YYYY-MM-DD`) for the day the user referred to, present only when a date/day was mentioned. Add a new forced-tool-use Anthropic call (`extract_delete_target`, `tool_choice: { type: 'tool', name: 'extract_delete_target' }`) reusing the same current-date/timezone context message format as `parseEventFromTranscript`, so relative dates ("tomorrow", "next Tuesday") resolve the same way they already do for create. `searchQuery` is `required`; `dateHint` is optional in the tool's `input_schema`. Reuses the existing `ParseError` class for both the non-2xx and missing-tool-use-block failure cases, matching `parseEventFromTranscript`'s error handling exactly.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm test -- event-parser.test.ts`
- [ ] Full test suite passes: `npm test`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] N/A for this phase — verified end-to-end in Phase 4

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Delete business logic

### Overview

New `delete-event-tool.ts` owning the delete-specific logic that doesn't belong in the generic API layer: resolving the search window, running the search, picking the match, and the final destructive commit call — mirroring `create-event-tool.ts`'s shape throughout.

### Changes Required:

#### 1. Search-window resolution + match lookup

**File**: `src/lib/delete-event-tool.ts` (new)

**Intent**: Given the parsed `DeleteSearchQuery`, find the single best calendar event to show on the confirm screen, without ever committing a delete.

**Contract**: Exports `EventMatch = { event: CalendarEvent; matchCount: number }` and `findEventToDelete(target: DeleteSearchQuery, onUnauthorized?: () => void): Promise<EventMatch | { error: string }>`. Internally: `getAccessToken()` (return the same `'Unable to access your calendar right now...'` error string as `handleCreateEventTool` when null); resolve the time window — if `target.dateHint` is present, that day's local midnight-to-midnight (same boundary math as `listTodayEvents`); otherwise now through +30 days; call `searchEvents(accessToken, target.searchQuery, timeMin, timeMax)`; if zero results, return `{ error: "I couldn't find a matching event to delete." }`; otherwise return the first (soonest) result as `event` and the full result-array length as `matchCount`. On `CalendarApiError` with `status === 401`, call `signOutLocally()` + `onUnauthorized?.()` and return the same expired-access error string `handleCreateEventTool` uses; on any other error, return a generic "something went wrong finding that event" string. Never throws.

#### 2. Delete commit call

**File**: `src/lib/delete-event-tool.ts`

**Intent**: The final, irreversible commit step, only ever called after the user has confirmed the matched event on screen.

**Contract**: `handleDeleteEventTool(eventId: string, onUnauthorized?: () => void): Promise<string>`. Same shape as `handleCreateEventTool`: `getAccessToken()` internally, call `deleteEvent(accessToken, eventId)`, return a success string on completion, the same 401/expired-access handling (`signOutLocally()` + `onUnauthorized?.()`), and a generic error string on any other failure. Never throws.

### Success Criteria:

#### Automated Verification:

- [ ] Unit tests pass: `npm test -- delete-event-tool.test.ts`
- [ ] Full test suite passes: `npm test`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:

- [ ] N/A for this phase — verified end-to-end in Phase 4

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: UI integration

### Overview

Wire the full delete flow into `VoiceScreen`: a third dedicated button, a parallel set of phases, and a confirm screen showing the matched event before the destructive call fires.

### Changes Required:

#### 1. Delete flow state and phases

**File**: `src/app/index.tsx`

**Intent**: Give the delete flow its own phase names and target state, parallel to (not reusing) the create flow's, so create and delete never share ambiguous state.

**Contract**: Extend `ScreenPhase` with delete-specific values (e.g. `recordingDelete`, `transcribingDelete`, `findingEvent`, `confirmingDelete`, `deleting`) alongside the existing ones. Add a `deleteTarget: EventMatch | null` state alongside `draft`. Reuses the existing `pipelineError`/`resultMessage` state for delete's errors and outcome message — no new error-display state needed.

#### 2. Third button and press-and-hold handlers

**File**: `src/app/index.tsx`

**Intent**: A "Hold to delete an event" control, gated identically to the existing create button (disabled unless signed in and idle), that drives transcribe → `parseDeleteTargetFromTranscript` → `findEventToDelete` → `confirmingDelete`.

**Contract**: `handleDeletePressIn`/`handleDeletePressOut` mirror `handlePressIn`/`handlePressOut` exactly (same recorder start/stop, same `pipelineError` clearing and catch-to-idle behavior) but call `parseDeleteTargetFromTranscript` then `findEventToDelete` in sequence; when `findEventToDelete` returns `{ error }`, set `pipelineError` and return to `idle` instead of entering `confirmingDelete`. The button sits alongside the existing two, disabled whenever `phase !== 'idle'` (matching the "What's on today?" button's disable rule) except while actively recording delete audio.

#### 3. Delete confirm screen

**File**: `src/app/index.tsx`

**Intent**: Show the matched event and let the user confirm or cancel before the irreversible delete, mirroring the existing create-confirm block's structure and styling.

**Contract**: A new JSX block gated on `phase === 'confirmingDelete' && deleteTarget`, using the same `styles.confirmRow`/`styles.button` as the create-confirm block. Displays `deleteTarget.event.summary` and its formatted start time (reuse or mirror `formatDraftTime`'s formatting for a single point-in-time value, no duration needed since `CalendarEvent` has no `durationMinutes`). When `deleteTarget.matchCount > 1`, add a line noting how many similar events were found (e.g. "1 of N matching events — is this the one?") so the user has the context needed to catch a wrong auto-pick. Confirm calls `handleDeleteEventTool(deleteTarget.event.id, () => void session.forceSignOut())`, sets `resultMessage`, clears `deleteTarget`, returns to `idle`. Cancel clears `deleteTarget` and returns to `idle` with no API call, matching `handleCancel`.

#### 4. Main-buttons visibility condition

**File**: `src/app/index.tsx`

**Intent**: Keep the main two-button row hidden during any confirm screen, not just create's.

**Contract**: Extend the existing `session.state === 'signedIn' && phase !== 'confirming'` guard to also exclude `'confirmingDelete'` (e.g. `phase !== 'confirming' && phase !== 'confirmingDelete'`), consistent with how the create-confirm block is already excluded today.

### Success Criteria:

#### Automated Verification:

- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`
- [ ] Full test suite still passes: `npm test`

#### Manual Verification:

- [ ] Holding the new button, describing an existing event, and confirming deletes exactly that event from Google Calendar within a few seconds
- [ ] Cancel on the delete-confirm screen leaves Google Calendar unchanged and returns to idle
- [ ] Describing an event with a specific day (e.g. "tomorrow") narrows the match to that day rather than matching a same-titled event on a different day
- [ ] When multiple similar events exist, the confirm screen's "N matching events" note appears and the shown event is the soonest upcoming one
- [ ] Describing an event that doesn't exist shows a "couldn't find a matching event" error and returns to idle without attempting a delete
- [ ] A revoked Calendar grant during the delete flow (search step or commit step) tears down the session exactly like the existing create/read-today flows — signs out and returns to the sign-in screen

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `google-calendar-api.test.ts`: `searchEvents` sends `q`/`timeMin`/`timeMax`/`singleEvents`/`orderBy` correctly, maps results, throws `CalendarApiError` on non-2xx; `deleteEvent` sends `method: 'DELETE'` to the correct URL with the auth header, throws `CalendarApiError` on non-2xx.
- `event-parser.test.ts`: `parseDeleteTargetFromTranscript` sends the correct forced-tool-use request shape (`extract_delete_target`, current date/timezone context), maps a `tool_use` response to `DeleteSearchQuery` with and without `dateHint`, throws `ParseError` when no `tool_use` block is present, throws `ParseError` on non-2xx.
- `delete-event-tool.test.ts` (new, mirrors `create-event-tool.test.ts`'s `jest.mock` structure): `findEventToDelete` picks the first (soonest) result and reports `matchCount`, resolves the day-window when `dateHint` is present vs. the 30-day-forward window when absent, returns the not-found error string on zero results, signs out and returns the expired-access string on a 401, returns a generic error string on other failures, returns the no-access string when `getAccessToken` resolves `null`. `handleDeleteEventTool` deletes and returns a success string, signs out on 401, returns a generic error string otherwise.

### Integration Tests:

None — this codebase has no integration test layer; API-layer and tool-handler unit tests (mocking `fetch` / the API module respectively) are the deepest automated coverage, matching the two sibling slices.

### Manual Testing Steps:

1. Create a test event on the real Google Calendar with a distinctive title (e.g. "Dentist checkup") a few days out.
2. Hold the delete button, say "delete my dentist checkup appointment," release, confirm the match, tap Confirm — verify it's gone from Google Calendar.
3. Create two same-titled events on different days; hold the delete button and mention one specific day — verify the confirm screen shows the event on the mentioned day and notes "N matching events."
4. Hold the delete button and describe something that doesn't exist — verify the "couldn't find a matching event" error and a clean return to idle.
5. Confirm a delete, then verify Cancel on a separate attempt leaves the calendar untouched.
6. Revoke the app's Calendar access from the Google Account permissions page, then attempt a delete — verify the session tears down and returns to sign-in, matching the existing 401 behavior for create/read-today.

## Performance Considerations

None beyond what the existing flows already accept — a single search + single delete round trip per user action, no different in shape from create's conflict-check + create round trip.

## Migration Notes

None — no data model or persisted state changes; this only adds new client-side flows and Calendar API calls.

## References

- Sibling implementation: `src/lib/create-event-tool.ts`, `src/lib/create-event-tool.test.ts`
- Sibling API conventions: `src/lib/google-calendar-api.ts:31-116`
- Sibling parser conventions: `src/lib/event-parser.ts`, `src/lib/event-parser.test.ts`
- Screen state machine to extend: `src/app/index.tsx`
- Roadmap slice: `context/foundation/roadmap.md` (S-03)
- PRD requirements: `context/foundation/prd.md` (FR-008, FR-009)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Calendar API additions — search and delete

#### Automated

- [x] 1.1 Unit tests pass: `npm test -- google-calendar-api.test.ts` — 3e8539d
- [x] 1.2 Full test suite passes: `npm test` — 3e8539d
- [x] 1.3 Type checking passes: `npx tsc --noEmit` — 3e8539d
- [x] 1.4 Linting passes: `npm run lint` — 3e8539d

### Phase 2: Delete-target voice parsing

#### Automated

- [x] 2.1 Unit tests pass: `npm test -- event-parser.test.ts` — 1fae403
- [x] 2.2 Full test suite passes: `npm test` — 1fae403
- [x] 2.3 Type checking passes: `npx tsc --noEmit` — 1fae403
- [x] 2.4 Linting passes: `npm run lint` — 1fae403

### Phase 3: Delete business logic

#### Automated

- [x] 3.1 Unit tests pass: `npm test -- delete-event-tool.test.ts` — 40ad363
- [x] 3.2 Full test suite passes: `npm test` — 40ad363
- [x] 3.3 Type checking passes: `npx tsc --noEmit` — 40ad363
- [x] 3.4 Linting passes: `npm run lint` — 40ad363

### Phase 4: UI integration

#### Automated

- [x] 4.1 Type checking passes: `npx tsc --noEmit`
- [x] 4.2 Linting passes: `npm run lint`
- [x] 4.3 Full test suite still passes: `npm test`

#### Manual

- [x] 4.4 Holding the new button, describing an existing event, and confirming deletes exactly that event from Google Calendar within a few seconds
- [x] 4.5 Cancel on the delete-confirm screen leaves Google Calendar unchanged and returns to idle
- [x] 4.6 Describing an event with a specific day narrows the match to that day rather than matching a same-titled event on a different day
- [x] 4.7 When multiple similar events exist, the confirm screen's "N matching events" note appears and the shown event is the soonest upcoming one
- [x] 4.8 Describing an event that doesn't exist shows a "couldn't find a matching event" error and returns to idle without attempting a delete
- [x] 4.9 A revoked Calendar grant during the delete flow tears down the session exactly like the existing create/read-today flows
