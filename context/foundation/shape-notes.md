---
project: "voice-assistant"
context_type: greenfield
created: 2026-08-22
updated: 2026-08-22
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "workflow friction — the capability sort of exists (typing into Google Calendar) but is unsafe/impractical while driving"
    - topic: "insight"
      decision: "voice assistants (Siri, Google Assistant) don't understand natural scheduling intent well; general voice assistants aren't tuned for driving-safe interaction"
    - topic: "primary persona scope"
      decision: "just me — a single named user, personal tool built for own driving routine first"
    - topic: "confirmation before write"
      decision: "agent reads back what it understood and asks for voice confirmation before creating the calendar event"
    - topic: "MVP timeline"
      decision: "three weeks of after-hours work; full flow (write + read) fits"
  frs_drafted: 9
  quality_check_status: warned
product_type: mobile
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# Shape Notes

Seed idea: Voice agent app for iOS (Expo) that fills in and reads from Google Calendar.

## Vision & Problem Statement

The user, while driving, cannot safely enter new calendar events or check upcoming ones by hand. Today they either pull over or fumble with the phone to type into Google Calendar, or they skip it entirely and risk forgetting the event or double-booking.

Existing voice assistants (Siri, Google Assistant) can create basic reminders but don't understand natural, conversational scheduling language or calendar nuance, and they aren't tuned for the specific constraints of a driving UX — short interactions, safety, minimal confirmation steps. A voice agent purpose-built for reading and writing Google Calendar entries hands-free closes that gap.

## User & Persona

**Primary persona:** the user themself (single named user) — a driver who needs to add or check Google Calendar events hands-free while driving. This is a personal tool built for their own driving routine first, not a multi-tenant product.

## Access Control

Single user, single device. No app-level login or account system, no role separation. The only credential involved is a one-time Google sign-in (OAuth) to grant the app permission to read and write the user's Google Calendar.

## Success Criteria

### Primary
- User can dictate an event by voice while driving, have it transcribed and parsed, confirm it by voice, and have it written to Google Calendar.
- User can ask by voice what's on today's calendar and receive an accurate spoken answer based on actual Google Calendar data.

### Secondary
- None identified for MVP.

### Guardrails
- No accidental double-bookings — the agent must not create conflicting or duplicate events without the user being made aware.
- Privacy of calendar data — calendar contents and voice recordings are not exposed or retained beyond what's needed to fulfill the request.

## MVP Flow

**Write (dictate → calendar):**
1. User speaks a voice message describing an event (e.g. "meeting with X tomorrow at 3pm")
2. App transcribes speech to text
3. App parses the text into event details (title, date, time, etc.)
4. App reads back what it understood and asks for voice confirmation
5. On confirmation, app creates the corresponding event in Google Calendar

**Read (ask → hear):**
6. User asks by voice, e.g. "what meetings do I have today?"
7. App looks up today's events in Google Calendar and answers back by voice

## Functional Requirements

- FR-001: User can dictate a new event by voice. Priority: must-have
  > Socrates: Counter-argument considered: "voice-only input for complex events (attendees, recurring, multi-day) is hard to disambiguate hands-free." Resolution: kept as written.
- FR-002: App transcribes the user's spoken input to text. Priority: must-have
  > Socrates: Counter-argument considered: "road noise could corrupt transcription before parsing even begins." Resolution: kept as written.
- FR-003: App parses transcribed text into event details (title, date, time). Priority: must-have
  > Socrates: Counter-argument considered: "relative-date/timezone parsing is a known hard problem and could silently produce a wrong-time event." Resolution: kept as written.
- FR-004: App reads back the parsed event by voice and asks for confirmation before creating it. Priority: must-have
  > Socrates: Counter-argument considered: "confirmation itself adds a distracting voice exchange while driving." Resolution: kept as written.
- FR-005: On confirmation, app creates the event in Google Calendar. Priority: must-have
  > Socrates: Counter-argument considered: "direct write to the primary calendar means upstream bugs propagate into a system of real commitments; no offline handling." Resolution: kept as written.
- FR-006: User can ask by voice what meetings are on today's calendar. Priority: must-have
  > Socrates: Counter-argument considered: "\"today\" is a narrow query surface — users may want \"what's next\" instead." Resolution: kept as written.
- FR-007: App reads back today's meetings by voice, based on actual Google Calendar data. Priority: must-have
  > Socrates: Counter-argument considered: "a full day's readout is a long, potentially distracting voice interaction with no way to skip ahead." Resolution: kept as written.
- FR-008: User can delete an event by voice. Priority: must-have
  > Socrates: Counter-argument considered: "identifying which event to delete by voice is ambiguous when similar/overlapping events exist." Resolution: kept as written.
- FR-009: App reads back the event to be deleted by voice and asks for confirmation before deleting it. Priority: must-have
  > Socrates: Counter-argument considered: "deletion is irreversible with no undo — a single confirmation may not be a strong enough safety net." Resolution: kept as written.

## User Stories

### US-01: User creates an event by voice while driving

- **Given** the user is driving and has the app open (or activated hands-free)
- **When** they dictate an event description by voice
- **Then** the app transcribes it, parses it into event details, reads back what it understood, and — on voice confirmation — creates the event in Google Calendar

#### Acceptance Criteria
- The read-back must include enough detail (title, date, time) for the user to catch a misheard/misparsed entry
- If the user says no / corrects it, no event is created
- The event appears in Google Calendar within a few seconds of confirmation

## Business Logic

# TODO: domain rule — see Open Questions

## Non-Functional Requirements

- None captured beyond what's already stated as guardrails (no accidental double-bookings; privacy of calendar data — see Success Criteria).

## Open Questions

1. **What is the one-sentence business rule?** — User confirmed this is pure CRUD (voice-driven create/read/delete against Google Calendar) with no domain decision applied by the app. Owner: user. Block: no (accepted as-is).

## Non-Goals

- No multi-account / shared calendar support — single Google account only for v1; no support for multiple calendars or shared/team calendars.

## Quality cross-check

- **Business Logic**: missing — no one-sentence domain rule; the app is confirmed pure CRUD (voice-driven create/read/delete against Google Calendar). Consequence: the PRD's Business Logic section will read `# TODO: domain rule — see Open Questions`, and the product provides no value beyond a voice-driven interface to existing CRUD operations. Accepted by user; recorded as a warning.

## Forward: tech-stack

- User wants to use the ElevenLabs API (voice/speech) — a stack decision for the tech-stack-selection step, not part of this PRD.
