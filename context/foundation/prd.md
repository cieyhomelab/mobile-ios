---
project: "voice-assistant"
version: 1
status: draft
created: 2026-08-22
context_type: greenfield
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

## Vision & Problem Statement

The user, while driving, cannot safely enter new calendar events or check upcoming ones by hand. Today they either pull over or fumble with the phone to type into Google Calendar, or they skip it entirely and risk forgetting the event or double-booking.

Existing voice assistants (Siri, Google Assistant) can create basic reminders but don't understand natural, conversational scheduling language or calendar nuance, and they aren't tuned for the specific constraints of a driving UX — short interactions, safety, minimal confirmation steps. A voice agent purpose-built for reading and writing Google Calendar entries hands-free closes that gap.

## User & Persona

**Primary persona:** the user themself (single named user) — a driver who needs to add or check Google Calendar events hands-free while driving. This is a personal tool built for their own driving routine first, not a multi-tenant product.

## Success Criteria

### Primary
- User can dictate an event by voice while driving, have it transcribed and parsed, confirm it by voice, and have it written to Google Calendar.
- User can ask by voice what's on today's calendar and receive an accurate spoken answer based on actual Google Calendar data.

### Secondary
- None identified for MVP.

### Guardrails
- No accidental double-bookings — the agent must not create conflicting or duplicate events without the user being made aware.
- Privacy of calendar data — calendar contents and voice recordings are not exposed or retained beyond what's needed to fulfill the request.

## User Stories

### US-01: User creates an event by voice while driving

- **Given** the user is driving and has the app open (or activated hands-free)
- **When** they dictate an event description by voice
- **Then** the app transcribes it, parses it into event details, reads back what it understood, and — on voice confirmation — creates the event in Google Calendar

#### Acceptance Criteria
- The read-back must include enough detail (title, date, time) for the user to catch a misheard/misparsed entry
- If the user says no / corrects it, no event is created
- The event appears in Google Calendar within a few seconds of confirmation

## Functional Requirements

- FR-001: User can dictate a new event by voice. Priority: must-have
  > Socratic: Counter-argument considered: "voice-only input for complex events (attendees, recurring, multi-day) is hard to disambiguate hands-free." Resolution: kept as written.
- FR-002: App transcribes the user's spoken input to text. Priority: must-have
  > Socratic: Counter-argument considered: "road noise could corrupt transcription before parsing even begins." Resolution: kept as written.
- FR-003: App parses transcribed text into event details (title, date, time). Priority: must-have
  > Socratic: Counter-argument considered: "relative-date/timezone parsing is a known hard problem and could silently produce a wrong-time event." Resolution: kept as written.
- FR-004: App reads back the parsed event by voice and asks for confirmation before creating it. Priority: must-have
  > Socratic: Counter-argument considered: "confirmation itself adds a distracting voice exchange while driving." Resolution: kept as written.
- FR-005: On confirmation, app creates the event in Google Calendar. Priority: must-have
  > Socratic: Counter-argument considered: "direct write to the primary calendar means upstream bugs propagate into a system of real commitments; no offline handling." Resolution: kept as written.
- FR-006: User can ask by voice what meetings are on today's calendar. Priority: must-have
  > Socratic: Counter-argument considered: "\"today\" is a narrow query surface — users may want \"what's next\" instead." Resolution: kept as written.
- FR-007: App reads back today's meetings by voice, based on actual Google Calendar data. Priority: must-have
  > Socratic: Counter-argument considered: "a full day's readout is a long, potentially distracting voice interaction with no way to skip ahead." Resolution: kept as written.
- FR-008: User can delete an event by voice. Priority: must-have
  > Socratic: Counter-argument considered: "identifying which event to delete by voice is ambiguous when similar/overlapping events exist." Resolution: kept as written.
- FR-009: App reads back the event to be deleted by voice and asks for confirmation before deleting it. Priority: must-have
  > Socratic: Counter-argument considered: "deletion is irreversible with no undo — a single confirmation may not be a strong enough safety net." Resolution: kept as written.

## Non-Functional Requirements

- None captured beyond what's already stated as guardrails (no accidental double-bookings; privacy of calendar data — see Success Criteria).

## Business Logic

# TODO: domain rule — see Open Questions

## Access Control

Single user, single device. No app-level login or account system, no role separation. The only credential involved is a one-time Google sign-in (OAuth) to grant the app permission to read and write the user's Google Calendar.

## Non-Goals

- No multi-account / shared calendar support — single Google account only for v1; no support for multiple calendars or shared/team calendars.

## Open Questions

1. **What is the one-sentence business rule?** — User confirmed this is pure CRUD (voice-driven create/read/delete against Google Calendar) with no domain decision applied by the app. Owner: user. Block: no (accepted as-is).
