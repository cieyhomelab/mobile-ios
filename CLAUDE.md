@AGENTS.md

# Project structure

- `src/app/` — expo-router routes. `index.tsx` is the single-screen voice
  assistant (onboarding → home idle/listening → confirm create/delete); logic
  lives in hooks/callbacks at the top of the file, presentation in small local
  components below it (`OnboardingView`, `HomeView`, `ActionTile`,
  `ConfirmCreateView`, `ConfirmDeleteView`).
- `src/lib/` — pure logic, each paired with a `*.test.ts`: Google Calendar API
  calls (`google-calendar-api.ts`), OAuth (`google-calendar-auth.ts`),
  voice pipeline (`audio-recorder.ts`, `voice-stt.ts`, `voice-tts.ts`),
  transcript→structured-data parsing via Claude tool use
  (`event-parser.ts`), the create/delete tool handlers that call the
  Calendar API (`create-event-tool.ts`, `delete-event-tool.ts`), and
  BYOK key storage/validation (`secure-keys.ts` — see BYOK note below).
- **BYOK — no build-time secrets.** The ElevenLabs and Anthropic API keys are
  user-entered, not build-time env vars: they're read/written exclusively
  through `src/lib/secure-keys.ts` (backed by `expo-secure-store`/Keychain)
  and entered on the Settings tab (`src/app/settings.tsx`). Never reintroduce
  them via `.env.local`, `app.json`, or an `EXPO_PUBLIC_*` var — a release
  build must ship with zero keys baked into the JS bundle.
- `src/hooks/use-google-calendar-session.ts` — auth/session state machine
  (`loading` / `signedOut` / `signedIn`). Has a `DEBUG_FORCE_SIGNED_IN` const
  at the top for forcing the signed-in UI locally without real Google OAuth —
  flip it temporarily to preview signed-in screens, but always revert it
  before committing (it's marked `// TEMP DEBUG`, not meant to ship `true`).
- `src/constants/theme.ts` — light/dark theme tokens used by the generic
  `Themed*` components (`explore.tsx`, tab bar, etc).
- `src/constants/voice-theme.ts` — a separate, fixed **dark-only** palette
  used exclusively by the voice-assistant screens in `app/index.tsx`. These
  screens don't follow system light/dark mode by design (matches
  `design/screens/*.png`), so don't route them through `theme.ts`/`useTheme()`.
- `design/` — pen.dev source (`mobile-ios.pen`, opened via the `pencil` MCP
  server, not `Read`/`Grep`) plus exported reference PNGs in `design/screens/`.
  When implementing a screen from design, treat the PNGs as the pixel source
  of truth since the `.pen` file requires the pen.dev editor to be open to
  query via MCP (headless `execute`/`get_app_state` calls fail otherwise).

# Commands

- `npm run lint` — `expo lint` (ESLint), `npx tsc --noEmit` — typecheck,
  `npm test` — Jest (`jest-expo` preset). Run all three before calling a
  change done; none of them start a simulator/device.
- `npm run ios` / `npx expo run:ios --device <name-or-UDID>` — full native
  build + install + launch. Slow (~2-3 min) but required for anything using
  `expo-symbols` (SF Symbols), `NativeTabs`, or other native-only modules that
  `expo start --web` can't render.
- `npx expo run:ios --help` shows `-d/--device`, `-p/--port`, and `--binary`
  (skip rebuilding, reinstall an existing `.app`).

# iOS run gotchas (hit while testing this repo)

- **Reused binaries keep a stale bundler port baked in.** The dev-server host
  is baked into the built app's `Info.plist` at *build* time. Passing
  `--binary <old .app>` to reuse a previous build does **not** update that
  baked-in address, even if you also pass a different `--port` — the app will
  silently keep talking to whatever port it was originally built with. If the
  app loads the wrong JS (e.g. errors mentioning files that don't exist in
  this repo), don't chase it with `simctl openurl`/uninstall/reinstall —
  those don't touch the baked-in host. Do a genuine fresh
  `expo run:ios --device <id> --port <free-port>` (no `--binary`) instead.
- **Port 8081 may already be taken by an unrelated local Expo project** on
  this machine (any project scaffolded from the same starter defaults to the
  package name `bootstrap-scaffold`, so `lsof -ti:8081` won't obviously look
  like "someone else's app"). Check `lsof -ti:8081 -sTCP:LISTEN` and
  `lsof -p <pid> | grep cwd` before assuming a port conflict is this repo's
  own leftover process; pick a free port explicitly with `--port` rather than
  fighting over 8081.
- **Simulator UDIDs vs. physical device identifiers differ by tool.**
  `xcrun simctl list devices` UDIDs work for simulators. For a physical
  iPhone, `xcrun devicectl list devices` and `xcrun xctrace list devices`
  can report different-looking identifiers for the same device — `expo run:ios
  --device` wants the `xctrace`-style UDID (e.g. `00008140-...`), not the
  `devicectl`-style UUID. If `expo run:ios` says "No device UDID or name
  matching", cross-check with `xctrace list devices` first.
- A physical device must show `developerModeStatus: enabled` and
  `pairingState: paired` in `xcrun devicectl device info details --device
  <id>` before a run will succeed; `xctrace`'s "Offline" listing doesn't
  always reflect a just-reconnected device — trust `devicectl` for current
  connection state.
