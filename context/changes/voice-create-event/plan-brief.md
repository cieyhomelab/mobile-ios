# Voice Create Event — Plan Brief

> Full plan: `context/changes/voice-create-event/plan.md`

## What & Why

While driving, the user can't safely type new calendar events. This slice delivers the roadmap's north star: a hands-free voice loop — wake word → dictate → read back → confirm → write to Google Calendar — that closes the gap general voice assistants leave (they don't understand conversational scheduling language or driving-safety UX constraints).

## Starting Point

Google Calendar OAuth is already wired and merged (`google-calendar-oauth`): `getAccessToken()` returns a valid, auto-refreshing token with the exact scope (`calendar.events`) this feature needs to write events — no new consent required. Nothing else voice-related exists: no audio/STT/TTS/NLP dependencies, no microphone permission, no test framework. The Home tab currently shows a throwaway OAuth-verification screen its own plan already earmarked for replacement here.

## Desired End State

App open and signed in → wake-word listening arms automatically → user says the wake word → dictates an event → the agent reads it back and asks to confirm → on "yes," the event is checked for conflicts and written to Google Calendar within a few seconds → listening resumes. A revoked-access 401 mid-flow tears everything down cleanly and returns to the sign-in screen.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Voice pipeline | Single ElevenLabs Conversational AI agent (bundled STT+LLM+TTS) + custom tool | Avoids writing custom NLU/date-parsing code; Expo SDK 57 has no built-in STT anyway | Plan |
| Recording trigger | Custom wake word via Picovoice Porcupine, foreground-only | User wants zero-touch activation; background listening is undocumented/unscoped risk against the 3-week timeline | Plan |
| API key handling | Embed ElevenLabs + Picovoice keys client-side | Matches the precedent already set by the OAuth change's hardcoded client IDs; no backend | Plan |
| Confirm-before-create | Explicit deliverable (Phase 5, dashboard config) | FR-004 is a must-have safety gate — verify it rather than assume the existing agent already does it | PRD (FR-004) / Plan |
| Conflict guardrail | Client-side tool handler checks existing events before writing | Directly satisfies the PRD's explicit "no accidental double-bookings" guardrail | PRD / Plan |
| Screen placement | Replace the Home tab | The OAuth change's own plan-brief already earmarked this screen for replacement by this slice | Research (OAuth plan-brief) |
| On-screen UI during a session | Minimal status only, no live transcript | Keeps the screen glanceable while driving, matching the PRD's core safety motivation | Plan |
| Testing scope | Unit tests only on the Calendar create/conflict/tool-handler logic | The one hardware-independent, highest-consequence piece; voice/wake-word/agent flow stays manual-only | Plan |

## Scope

**In scope:** wake-word-triggered voice session, dictation, verbal read-back + confirmation, conflict check, Google Calendar event creation, 401 teardown handling, unit tests for the write-path logic.

**Out of scope:** background/backgrounded wake-word listening, live transcript UI, Android, App Store/EAS distribution, offline handling, reading today's calendar (S-02) or deleting events (S-03), multi-account/shared calendars.

## Architecture / Approach

Two vendor SDKs do the heavy lifting: Picovoice Porcupine (on-device wake-word detection) hands off to ElevenLabs Conversational AI (hosted STT+LLM+TTS session) once triggered; only one holds the microphone at a time. The agent calls a client-side `create_event` tool with structured `{title, startDateTime, durationMinutes?}`, which is the only new business logic written in this repo — a conflict check plus a Google Calendar `events.insert` call, following the exact conventions of the existing `google-calendar-api.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dependencies, permissions & credentials | New SDKs, mic permission, embedded keys, test runner wired up | Native module linking issues on `expo prebuild` |
| 2. Calendar create-event API + conflict check | Unit-tested write-path logic | Duration defaulting/timezone edge cases |
| 3. Wake-word listener | Foreground auto-arming Porcupine detection | On-device wake-word reliability in a car |
| 4. ElevenLabs session + screen replacement | The full end-to-end voice loop, replacing Home | Audio hand-off between Porcupine and ElevenLabs |
| 5. Agent dashboard configuration (non-code) | FR-004's confirm gate guaranteed, tool contract locked | Silent mismatch between dashboard tool schema and client handler |

**Prerequisites:** `google-calendar-oauth` merged (done); an ElevenLabs account + agent (already have); a Picovoice account for the wake-word AccessKey and custom keyword file (new).
**Estimated effort:** ~4-5 sessions across 5 phases, within the PRD's 3-week after-hours budget.

## Open Risks & Assumptions

- Porcupine's exact Expo config-plugin/asset-bundling mechanics weren't fully verified during planning (undocumented for Expo specifically) — Phase 1 implementer should follow Porcupine's current published iOS integration docs directly.
- iOS background-audio behavior for Porcupine is undocumented; foreground-only scope sidesteps this but should be re-verified if requirements ever expand to backgrounded listening.
- The confirm-before-create safety gate (FR-004) ultimately lives in a dashboard-configured system prompt outside this repo's version control — Phase 5's manual verification is the only enforcement mechanism.

## Success Criteria (Summary)

- Saying the wake word, dictating an event, and confirming verbally creates the correct event in Google Calendar within a few seconds.
- Declining the read-back never creates an event, and a real scheduling conflict is voiced before any write happens.
- A revoked Calendar grant is handled gracefully mid-session, without leaving the mic or screen in a broken state.
