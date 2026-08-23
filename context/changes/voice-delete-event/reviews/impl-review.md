<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Voice Delete Event

- **Plan**: context/changes/voice-delete-event/plan.md
- **Scope**: Full plan (Phases 1-4)
- **Date**: 2026-08-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — dateHint window shifts a day for timezones behind UTC

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability / Data safety)
- **Location**: src/lib/delete-event-tool.ts:14
- **Detail**: `resolveSearchWindow` does `new Date(dateHint)` where `dateHint` is a `"YYYY-MM-DD"` string, then reads `.getFullYear()/.getMonth()/.getDate()` (local-timezone getters). A date-only ISO string parses as UTC midnight per spec, so for any local timezone behind UTC (most of the Americas), those local getters roll back to the previous day — e.g. `dateHint "2026-08-24"` resolves to a search window for Aug 23 local time instead of Aug 24. Reproduced directly: `new Date('2026-08-24')` → `2026-08-24T00:00:00.000Z`; `.getDate()` returns 24 in a UTC+ timezone but 23 in a UTC-negative timezone. The existing create-flow avoids this exact class of bug by requiring `startDateTime` to always carry an explicit UTC offset (`event-parser.ts:23-27`); the new `dateHint` schema (`event-parser.ts:52-56`) has no such offset and feeds straight into a naive `new Date()` parse. The Phase 3 unit test didn't catch it because it ran in a timezone ahead of UTC, where the bug doesn't manifest. Practical effect: "delete tomorrow's dentist appointment" can search the wrong day for a US-timezone user, weakening the one disambiguation signal (day-narrowing) the design relies on.
- **Fix**: In `resolveSearchWindow`, parse `dateHint`'s `YYYY-MM-DD` components directly into local `Date` components instead of round-tripping through a UTC-parsed `Date` — e.g. split on `'-'` and construct `new Date(year, month - 1, day, 0, 0, 0, 0)` for both `timeMin` and `timeMax`, the same pattern `listTodayEvents` already uses for its own local midnight-to-midnight math.
- **Decision**: FIXED — parsed dateHint's YYYY-MM-DD components directly into local Date components in `resolveSearchWindow` (src/lib/delete-event-tool.ts:14-17), avoiding the UTC-midnight round-trip. Verified with TZ=America/Los_Angeles: window now correctly starts 2026-08-24T07:00:00.000Z (= Aug 24 00:00 local) instead of rolling back to Aug 23.
