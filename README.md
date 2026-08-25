# Voice Calendar Assistant

A hands-free Google Calendar assistant built with [Expo](https://expo.dev) and
[expo-router](https://docs.expo.dev/router/introduction). Hold a button, speak,
and it creates, checks, or deletes events on your Google Calendar — designed
for use while driving.

<img src="design/screens/3-home-listening.png" alt="Home screen, listening state" width="320" />

## Features

- **Create an event by voice** — "Dentist appointment tomorrow at 2pm for an hour"
- **Check what's on today** — read back out loud via text-to-speech
- **Delete an event by voice** — finds the matching event and asks for confirmation before deleting
- Every create/delete action shows a confirm screen ("Did I get this right?") before touching your calendar
- Sign-in via Google OAuth, scoped to calendar events only

## How it works

Every voice command goes through the same pipeline: record → transcribe →
parse intent → act. "Create" and "delete" both stop at a confirm screen
before touching your calendar; "what's on today" skips straight to a spoken
readout.

```mermaid
flowchart TD
    A[Hold mic button] --> B["Record audio (expo-audio)"]
    B --> C["Speech-to-text (ElevenLabs Scribe)"]
    C --> D["Parse intent (Claude Haiku, tool use)"]

    D -->|create event| E[Draft event confirm screen]
    D -->|delete event| F["Search Google Calendar for a match"]
    D -->|"what's on today"| G[Fetch today's events]

    E -->|Confirm| H["Create event (Google Calendar API)"]
    F --> I[Confirm-delete screen]
    I -->|Confirm| J["Delete event (Google Calendar API)"]
    G --> K["Read events aloud (ElevenLabs text-to-speech)"]
```

## Tech stack

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) + expo-router, TypeScript
- [@react-native-google-signin/google-signin](https://github.com/react-native-google-signin/google-signin) for OAuth, [Google Calendar API v3](https://developers.google.com/calendar/api/v3/reference) for events
- [ElevenLabs](https://elevenlabs.io) for speech-to-text and text-to-speech
- [Anthropic Claude](https://www.anthropic.com) (Haiku, forced tool use) to turn a transcript into structured event data
- `expo-symbols` (SF Symbols on iOS), `expo-audio`, native tabs — this app needs a real native build; it isn't fully testable in `expo start --web`

## Get started

1. Install dependencies

   ```bash
   npm ci
   ```

   Use `npm ci` rather than `npm install` on a fresh clone — it installs
   exactly what's in `package-lock.json` and fails loudly instead of
   silently re-resolving versions.

2. There's no build-time API key to configure. Once the app is running,
   sign in with Google Calendar, then open the **Settings** tab and paste in
   your own keys:

   - an Anthropic key from [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
   - an ElevenLabs key from [elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys) (optionally pick a voice from [elevenlabs.io/app/voice-library](https://elevenlabs.io/app/voice-library)) — give it unrestricted/full permissions, since validation calls `/v1/user`, which needs "User" read access; a scoped key missing that permission fails validation even if it's otherwise valid

   Each key is validated against its provider before being saved, and stored
   in the iOS Keychain via `expo-secure-store` — never in `.env.local`,
   `app.json`, or an `EXPO_PUBLIC_*` env var. Voice features are unavailable
   until both keys are entered.

   Google Sign-In client IDs are already configured in
   `src/lib/google-calendar-auth.ts` for this project. If you fork this repo,
   swap in your own OAuth client IDs from the
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

3. Run it. Voice features depend on native modules (`expo-audio`,
   `expo-symbols`, native tabs), so use a real build rather than Expo Go or web:

   ```bash
   npm run ios
   npm run android
   ```

   Prefer these over a bare `npx expo run:ios`/`run:android`: `npx` can
   resolve an unexpected `expo` CLI (a stale global install or npx's own
   cache) instead of this project's local one, which has previously
   silently downgraded `package.json` to an old Expo SDK and broken the
   build. `npm run ios`/`android` always uses the local, `package.json`-pinned
   version.

   `npx expo start --web` also works for previewing layout/screens quickly,
   but Google Sign-In and audio recording aren't available there.

### Testing & linting

```bash
npm test          # Jest (jest-expo preset)
npm run lint       # expo lint (ESLint)
npx tsc --noEmit   # TypeScript
```

## Project structure

- `src/app/` — expo-router routes; `index.tsx` is the voice assistant screen
- `src/lib/` — voice pipeline, Google Calendar API/auth, and Claude-based transcript parsing (each paired with a `*.test.ts`)
- `src/hooks/` — session state (`use-google-calendar-session.ts`) and theme hooks
- `src/constants/` — `theme.ts` (app-wide light/dark tokens) and `voice-theme.ts` (fixed dark palette for the voice screens)
- `design/` — pen.dev source and exported screen mockups (`design/screens/`)

See `CLAUDE.md` / `AGENTS.md` for more detail on conventions and iOS build gotchas.

## Learn more

- [Expo documentation](https://docs.expo.dev/versions/v57.0.0/)
- [Expo Router](https://docs.expo.dev/router/introduction)
