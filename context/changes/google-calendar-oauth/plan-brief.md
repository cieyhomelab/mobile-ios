# Google Calendar OAuth Sign-in — Plan Brief

> Full plan: `context/changes/google-calendar-oauth/plan.md`

## What & Why

Wire up one-time Google OAuth sign-in, scoped to Google Calendar events, so the app can read and write the user's real calendar. This is roadmap Foundation F-01 — every voice flow (create, read, delete an event) needs an authenticated Calendar API token before it can do anything, so nothing downstream can be built or verified without this landing first.

## Starting Point

A fresh Expo Router (SDK 57) scaffold with no auth code, no Google integration, and no native config plugins beyond the router/splash-screen defaults. `app.json` has no `ios.bundleIdentifier` yet. The app currently only runs in Expo Go.

## Desired End State

Launching the app shows a "Connect Google Calendar" button on first run; after signing in, it displays real upcoming events pulled from the user's primary Google Calendar, proving the whole chain — OAuth, token, and an authenticated API call — actually works. On later launches, sign-in happens silently. If access is ever revoked, the app falls back to the connect screen instead of getting stuck.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Auth library | `@react-native-google-signin/google-signin` | Expo's own docs steer away from generic `expo-auth-session` for Google; this library also auto-refreshes tokens on iOS with no backend needed. | Plan (research) |
| Platform target | iOS only | Halves the Google Cloud Console setup and matches the 3-week solo/after-hours timeline. | User (question) |
| Calendar scope | `calendar.events` only | Least-privilege — matches the PRD's privacy guardrail and covers every FR without excess access. | User (question) |
| Session UX | Silent sign-in on app launch | Matches the driving use case — zero friction between opening the app and dictating an event. | User (question) |
| Sign-in UI | Minimal connect screen replacing the Home tab | Makes this Foundation independently testable without needing the voice UI to exist yet; throwaway, S-01 will replace it. | User (question) |
| Sign-in failure | Inline error, stay on connect screen | Simple, no new navigation states, acceptable for a single personal user. | User (question) |
| Revoked access (401) | Clear local session, route back to connect screen | Self-healing — the only path that recovers without manual troubleshooting. | User (question) |
| Done-criteria | Connect screen fetches and lists real upcoming events | Proves the full chain end-to-end, not just that a sign-in popup appeared. | User (question) |
| Dev workflow | Local dev client (`expo run:ios`), not Expo Go | Forced by the native library; doesn't conflict with the roadmap's parked EAS/App Store decision since it's a free local build. | Plan (research) |
| Build/distribution | No EAS or App Store | Roadmap already parked this — a local dev build is sufficient for personal MVP use. | Roadmap |

## Scope

**In scope:** Google Cloud OAuth client setup (Testing mode), native module + config plugin, local iOS dev client build, `calendar.events`-scoped sign-in, silent re-auth on launch, a minimal connect/verification screen, 401/revoked-access recovery.

**Out of scope:** Android, full `calendar` scope, any backend or server-side token handling, polished UI, EAS/App Store distribution, automated tests, multi-account switching UI.

## Architecture / Approach

Two small library modules (`src/lib/google-calendar-auth.ts` for the OAuth session, `src/lib/google-calendar-api.ts` for the Calendar REST call) sit behind a throwaway UI that replaces `src/app/index.tsx`. No backend — the native library manages the session and token refresh entirely on-device.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Native & Google Cloud setup | Package installed, `app.json` configured, OAuth clients created, app builds via local dev client | Misconfigured `iosUrlScheme` or bundle ID silently breaks the OAuth redirect |
| 2. Auth flow & verification screen | Sign-in, silent re-auth, connect screen, real event list, 401 recovery | A 401 handled without clearing the local session would loop back into the same failure on the next attempt |

**Prerequisites:** A Google account (the one to sign in with), Xcode + iOS simulator or a physical device for `expo run:ios`, access to Google Cloud Console.
**Estimated effort:** 2 phases, one pause point between them for manual device verification.

## Open Risks & Assumptions

- Assumes the developer has Xcode installed and can run `expo run:ios` locally — not verified in this plan.
- Assumes a single Google account is used for both development and personal daily use (no separate test account).

## Success Criteria (Summary)

- Tapping "Connect Google Calendar" completes sign-in and shows real events from the actual Google Calendar.
- Relaunching the app after a successful sign-in requires no further interaction — straight to the event list.
- Revoking access in the Google Account settings and retrying gracefully returns to the connect screen instead of a stuck error.
