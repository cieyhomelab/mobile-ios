---
project: "voice-assistant"
version: 1
status: draft
created: 2026-08-22
updated: 2026-08-22
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: voice-assistant

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

While driving, the user can't safely type new calendar events or check upcoming ones — they either pull over, fumble with the phone, or skip it and risk forgetting something or double-booking. General voice assistants (Siri, Google Assistant) don't understand conversational scheduling language or the safety constraints of a driving UX (short interactions, minimal confirmation steps). This is a personal, single-user voice agent purpose-built for reading and writing the user's own Google Calendar hands-free.

## North star

**S-01: User can create a calendar event by voice** — the smallest end-to-end flow that proves the core hypothesis: that a hands-free voice loop (dictate → transcribe → parse → confirm → write) can safely replace typing into Google Calendar while driving.

> "North star" here means the smallest end-to-end slice whose successful delivery proves the product's core idea works — placed as early as its Prerequisites allow, because everything else only matters if this does.

## At a glance

| ID   | Change ID                | Outcome (user can …)                                  | Prerequisites | PRD refs           | Status   |
| ---- | ------------------------- | ------------------------------------------------------ | -------------- | ------------------- | -------- |
| F-01 | `google-calendar-oauth`   | (foundation) Google Calendar OAuth sign-in wired        | —              | Access Control       | ready    |
| S-01 | `voice-create-event`      | Create a calendar event by voice, hands-free            | F-01           | US-01, FR-001..FR-005 | proposed |
| S-02 | `voice-read-today`        | Ask by voice what's on today's calendar                 | F-01           | FR-006, FR-007       | proposed |
| S-03 | `voice-delete-event`      | Delete a calendar event by voice                         | F-01, S-02      | FR-008, FR-009       | proposed |

## Baseline

What's already in place in the codebase as of `2026-08-22` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — default Expo Router scaffold (`src/app/_layout.tsx`, `index.tsx`, `explore.tsx`); no voice/calendar UI built yet.
- **Backend / API:** absent — no server, no API routes; the app is expected to call Google Calendar / voice provider APIs directly from the client.
- **Data:** absent — no database, no local persistence, no calendar/event data model.
- **Auth:** absent — no Google OAuth wiring yet, despite `tech-stack.md` flagging `has_auth: true`.
- **Deploy / infra:** partial — `app.json` has EAS-oriented icon/splash/plugin config per tech-stack hints (`deployment_target: appstore-via-eas`, `ci_provider: github-actions`), but no `eas.json` and no `.github/workflows` exist yet.
- **Observability:** absent — no logging or error-tracking beyond Expo defaults.

## Foundations

### F-01: Google Calendar OAuth sign-in

- **Outcome:** (foundation) The app can obtain a one-time Google OAuth grant and hold a valid, refreshable token scoped to read/write the user's Google Calendar.
- **Change ID:** `google-calendar-oauth`
- **PRD refs:** Access Control (one-time Google sign-in to grant Calendar read/write permission)
- **Unlocks:** S-01, S-02, S-03 — every voice flow needs Calendar API access; none can be built or verified without this.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** A misconfigured OAuth scope or consent flow blocks every downstream flow, so it's sequenced first rather than bolted on inside S-01.
- **Status:** ready

## Slices

### S-01: User creates an event by voice while driving

- **Outcome:** User can dictate an event by voice, have it transcribed and parsed, hear a read-back, confirm by voice, and have it written to Google Calendar.
- **Change ID:** `voice-create-event`
- **PRD refs:** US-01, FR-001, FR-002, FR-003, FR-004, FR-005
- **Prerequisites:** F-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Misparsed relative dates/times could silently create a wrong-time event in a real calendar (no offline handling, no undo built in); the voice read-back + confirmation (FR-004) is the safety net and must ship as part of this slice, not deferred to a later pass.
- **Status:** proposed

### S-02: User asks what's on today's calendar

- **Outcome:** User can ask by voice what's on today's calendar and receive an accurate spoken answer based on actual Google Calendar data.
- **Change ID:** `voice-read-today`
- **PRD refs:** FR-006, FR-007
- **Prerequisites:** F-01
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:** —
- **Risk:** A full-day readout can become a long, distracting voice interaction while driving with no way to skip ahead; sequenced right after the north star since it's the other Primary Success Criterion, but it's read-only so a mistake here can't corrupt real calendar data.
- **Status:** proposed

### S-03: User deletes an event by voice

- **Outcome:** User can delete an event by voice; the app reads back the event to be deleted and asks for confirmation before deleting it.
- **Change ID:** `voice-delete-event`
- **PRD refs:** FR-008, FR-009
- **Prerequisites:** F-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Deletion is irreversible with no undo, and identifying the right event by voice is ambiguous when similar/overlapping events exist; sequenced last so it can reuse S-02's calendar-lookup logic to disambiguate, and the read-back + confirmation (FR-009) is a hard prerequisite before any delete executes.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID              | Suggested issue title                              | Ready for `/10x-plan` | Notes                              |
| ---------- | ----------------------- | ---------------------------------------------------- | ---------------------- | ----------------------------------- |
| F-01       | `google-calendar-oauth` | Wire up one-time Google Calendar OAuth sign-in       | yes                     | Run `/10x-plan google-calendar-oauth` |
| S-01       | `voice-create-event`    | Voice: create a calendar event (dictate → confirm → write) | no                | Blocked on F-01                     |
| S-02       | `voice-read-today`      | Voice: ask what's on today's calendar                | no                      | Blocked on F-01                     |
| S-03       | `voice-delete-event`    | Voice: delete a calendar event (confirm before delete) | no                    | Blocked on F-01, S-02               |

## Open Roadmap Questions

1. **Does the Google OAuth consent screen need to run in "Testing" mode or full Google verification?** — Single personal user (yourself as the OAuth test user) likely avoids the review/verification lead time that "Production" mode with sensitive scopes would require, but this affects how quickly F-01 can actually be exercised. Owner: user. Block: F-01 (confirm before implementing, doesn't block starting the work).

## Parked

- **Multi-account / shared calendar support** — Why parked: PRD Non-Goals explicitly scopes v1 to a single Google account, no multiple or shared/team calendars.
- **EAS build, App Store distribution, and GitHub Actions auto-deploy pipeline** — Why parked: `tech-stack.md` defaults to `appstore-via-eas` + GitHub Actions, but none of the 3 must-have flows require store distribution to be built or verified — a local Expo dev build on your own device is sufficient for personal, after-hours MVP use within the 3-week window. Revisit once the north star and both other slices are working end-to-end.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived.)
