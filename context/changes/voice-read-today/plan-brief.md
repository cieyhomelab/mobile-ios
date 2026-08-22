# Voice Read Today — Plan Brief

> Full plan: `context/changes/voice-read-today/plan.md`

## What & Why

Roadmap slice S-02: while driving, the user can ask what's on today's calendar and get an accurate spoken answer, without looking at or typing on the phone. This is the other Primary Success Criterion from the PRD (FR-006/FR-007), alongside the already-shipped voice create-event flow.

## Starting Point

`google-calendar-api.ts` has `findConflictingEvents` (arbitrary time-window query) and `listUpcomingEvents` (unscoped "next 5", used only for session verification) but nothing scoped to "today." No text-to-speech exists anywhere in the app — `expo-audio` is currently used only for recording, not playback. The existing `VoiceScreen` (`src/app/index.tsx`) already handles Google auth, a `ScreenPhase` state machine, and 401 teardown for the create-event flow; none of that changes.

## Desired End State

Signed in, the user taps a new "What's on today?" button. The app fetches today's events (local midnight to midnight, all-day events included) and ElevenLabs speaks a concise summary — or "You have nothing on your calendar today." if the day is empty. A "Stop" control is visible while speaking so the user can interrupt at any time.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Trigger mechanism | Dedicated second button, not intent classification | Zero ambiguity, no new failure mode; matches the app's established preference for explicit controls over inferred voice intent | Plan |
| TTS engine | ElevenLabs Text-to-Speech API | Same vendor/key already used for STT; higher-quality voice than on-device TTS | Plan |
| Day scope | Local midnight-to-midnight, all-day events included ("all day") | Matches how `createEvent` already resolves timezone; omitting all-day events would silently hide real commitments | Plan |
| Long readout / driving safety | No cap on event count, but a Stop button to interrupt playback | Directly mitigates the PRD's driving-safety guardrail at near-zero implementation cost | Plan |
| Readout format | Concise: count + time + title per event | Minimal words to process while driving; satisfies FR-007's "today's meetings" (plural) | Plan |
| Empty-day handling | Always speak "nothing today," not silent/text-only | An eyes-free driver needs an answer even when the answer is "nothing" | Plan |
| Test coverage | Unit tests only on the Calendar query + spoken-text formatter | Matches the exact convention both sibling voice changes set; TTS/audio wiring stays manual-only | Plan |
| Audio bridging | ElevenLabs bytes → local file (`expo-file-system`) → `expo-audio` player | `expo-audio` only accepts URI/require sources, not raw bytes/Blob | Plan (research) |

## Scope

**In scope:** today-scoped Calendar query with all-day flag, spoken-text formatter, ElevenLabs TTS client + local audio playback, a new "What's on today?" button with a Stop control, 401 teardown reuse.

**Out of scope:** voice-triggered intent classification, capping/truncating long lists, reading beyond today, offline handling, retry/backoff, Android, any change to the existing create-event flow.

## Architecture / Approach

Two small new `src/lib/` modules (`today-readout.ts` for pure text formatting, `voice-tts.ts` for the ElevenLabs call + file write) sit alongside a new `listTodayEvents` query added to the existing `google-calendar-api.ts`, following that file's established `fetch` + typed-response + `*ApiError` convention. `VoiceScreen` gains two new `ScreenPhase` values (`fetchingToday`, `speakingToday`) and an `expo-audio` player initialized with `useAudioPlayer(null)`, whose source is set dynamically via `player.replace(uri)` once TTS synthesis completes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dependencies & credentials | `expo-file-system` added, `ELEVENLABS_VOICE_ID` placeholder | Low — mechanical |
| 2. Today-scoped Calendar API query | `listTodayEvents` + `allDay` flag, unit-tested | All-day vs timed event detection edge cases |
| 3. Events → spoken-text formatter | `formatTodayReadout`, unit-tested | Pluralization/join phrasing |
| 4. ElevenLabs TTS client | `synthesizeSpeech` → local `.mp3` file URI | Bridging raw audio bytes into a `file://` URI `expo-audio` can play |
| 5. UI integration | New button, Stop control, full end-to-end flow | Async player-source lifecycle (`useAudioPlayer(null)` + `replace()`) |

**Prerequisites:** `google-calendar-oauth` merged (done); an ElevenLabs API key (already have, reused from STT) and a chosen ElevenLabs voice ID (new — placeholder to fill in before running).
**Estimated effort:** ~2-3 sessions across 5 phases — smaller than `voice-create-event` since auth, session, and error-teardown plumbing are fully reused.

## Open Risks & Assumptions

- `expo-file-system`'s exact `File`/`Paths` write API was verified against current docs during planning but should be spot-checked at implementation time against the installed `~57.0.5` version.
- ElevenLabs' `eleven_multilingual_v2` model_id was confirmed via current docs; if readout latency feels slow in practice, a faster model tier could be swapped in later — not required for this MVP slice.
- Assumes the user always wants the full day's events read (no partial/next-event-only mode) per FR-007's "today's meetings" (plural).

## Success Criteria (Summary)

- Tapping "What's on today?" speaks an accurate summary of today's events, including all-day ones, or "nothing today" when the calendar is empty.
- Stop reliably interrupts playback mid-speech and returns to idle; a natural finish does the same without Stop.
- A revoked Calendar grant during the fetch tears down the session exactly like the existing create-event flow.
