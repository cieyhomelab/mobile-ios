# Voice Delete Event — Plan Brief

> Full plan: `context/changes/voice-delete-event/plan.md`

## What & Why

Roadmap slice S-03, the third and final voice-CRUD flow: while driving, the user can describe which calendar event to delete, hear/see it confirmed, and have it removed from Google Calendar. This closes out the PRD's must-have requirements (FR-008, FR-009) alongside the already-shipped create and read-today flows.

## Starting Point

`VoiceScreen` (`src/app/index.tsx`) already runs two voice flows on one screen: press-and-hold create (transcribe → Claude-parsed draft → text confirm → Calendar write) and tap-to-read-today (fetch → format → ElevenLabs TTS → playback). `google-calendar-api.ts` has no search-by-keyword and no delete endpoint; `event-parser.ts` has no delete-target extraction; there is no `delete-event-tool.ts` yet. Everything reused here — STT, the Anthropic parsing pattern, the Calendar API conventions, the confirm/cancel UI shape, the jest test setup — already exists; nothing new to install.

## Desired End State

The user holds a new "Hold to delete an event" button, describes the event (optionally naming a day), and releases. The app finds the closest matching event, shows it on a Confirm/Cancel screen (noting when more than one similar event was found), and on Confirm deletes it from Google Calendar within a few seconds. A revoked Calendar grant at any point tears down the session exactly like the existing flows.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Search window | Upcoming: today + next 30 days (or the mentioned day, if any) | Covers the realistic "delete an appointment I created" case without scanning distant history | Plan |
| Disambiguation | Auto-pick the closest (soonest) match; confirm screen notes the match count | Reuses the existing confirm/cancel tap gate as the safety net, same as create-event, with no new selection UI | Plan |
| Confirm friction | Same single Confirm/Cancel tap as create-event | Consistent with the rest of the app; the matched event is already shown in full before the tap | Plan |
| Confirm voice | Text-only, no spoken read-back | Matches create-event's existing (already PRD-deviating) convention; avoids new TTS/audio-session complexity on the confirm gate | Plan |
| Trigger UI | Dedicated third button, not intent classification | Matches the app's established preference for explicit controls over inferred voice intent | Plan |
| Search implementation | Google Calendar API's native `q` full-text param | Reuses Google's built-in search instead of reimplementing client-side keyword matching | Plan |
| Parse schema | `{ searchQuery, dateHint? }` | The optional date hint narrows the search window, directly strengthening disambiguation — the core risk the roadmap flags | Plan |

## Scope

**In scope:** Calendar search (`searchEvents`) + delete (`deleteEvent`) API calls, delete-target voice parsing, delete business logic (`delete-event-tool.ts`), third button + confirm screen on `VoiceScreen`, unit tests for all non-UI logic, 401 teardown reuse.

**Out of scope:** selectable candidate list UI, extra confirm friction (hold-to-confirm, second spoken confirmation), spoken read-back of the matched event, client-side fuzzy matching, bulk/recurring-series delete, changes to create-event or read-today, Android, EAS/App Store distribution.

## Architecture / Approach

Three new pieces slot in beside the existing ones, each following its sibling file's exact convention: `google-calendar-api.ts` gains `searchEvents` (generic, `q`-parameterized) and `deleteEvent`; `event-parser.ts` gains a second Claude Haiku tool-use call (`extract_delete_target`) producing `{ searchQuery, dateHint? }`; a new `delete-event-tool.ts` resolves the search window, picks the soonest match, and exposes the final delete commit call. `VoiceScreen` gets a third button and a parallel `ScreenPhase` set, wired the same way the read-today flow was added onto the create flow.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Calendar API additions | `searchEvents` + `deleteEvent`, unit-tested | None significant — thin, convention-following additions |
| 2. Delete-target voice parsing | `parseDeleteTargetFromTranscript`, unit-tested | Date-hint extraction accuracy for relative dates |
| 3. Delete business logic | `delete-event-tool.ts`: window resolution, match-picking, commit call | Search-window boundary math (day-of vs. 30-day-forward) |
| 4. UI integration | Third button, confirm-delete screen, full end-to-end flow | Auto-picked match being wrong when the user doesn't read the "N matching events" note carefully |

**Prerequisites:** `google-calendar-oauth` and `voice-read-today` merged (both done — reusing session auth, STT, and the Calendar API conventions established there).
**Estimated effort:** ~2 sessions across 4 phases — smaller than both prior slices since no new dependencies, SDKs, or credentials are needed.

## Open Risks & Assumptions

- Google Calendar's `q` full-text search matches across title, description, and location, not just the title — it can be looser than an exact title match, which is why the confirm screen's match-count note matters as the actual disambiguation safety net.
- The confirm screen's text-only, single-tap gate is a deliberate reduction from FR-009's literal "reads back... by voice" wording, mirroring the same reduction already accepted for FR-004 on create-event — flagged here in case that judgment call should be revisited.
- `dateHint` narrows to day-level granularity only; a spoken time-of-day (e.g. "my 3pm meeting") isn't used to narrow the window further, only the search text.

## Success Criteria (Summary)

- Describing an event by voice, confirming the match, deletes exactly that event from Google Calendar within a few seconds.
- Cancel never deletes anything; a non-existent event produces a clear "couldn't find" error instead of a wrong deletion.
- A revoked Calendar grant during the delete flow tears down the session exactly like the existing create/read-today flows.
