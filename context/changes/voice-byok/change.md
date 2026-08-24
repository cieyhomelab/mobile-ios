---
change_id: voice-byok
title: User-entered API keys in the app (BYOK)
status: implementing
created: 2026-08-24
updated: 2026-08-24
archived_at: null
---

# Plan: user-entered API keys in the app (BYOK)

Applies to the `mobile-ios` repo (Expo/React Native). Goal: remove
`EXPO_PUBLIC_ELEVENLABS_API_KEY` and `EXPO_PUBLIC_ANTHROPIC_API_KEY` from `.env.local` /
the build, and replace them with a settings screen where the user pastes in their own
keys, stored in the iOS Keychain via `expo-secure-store`.

End result: after installing from the App Store, the app ships with no key inside it.
Without the user entering their own keys, the voice features (STT/TTS) and intent
parsing (Claude) simply don't work.

---

## Plan 1 — ElevenLabs key (Speech-to-Text + Text-to-Speech)

### Step 1: Install dependencies
```bash
npx expo install expo-secure-store
```

### Step 2: Key storage module
New file `src/lib/secure-keys.ts`:
```ts
import * as SecureStore from 'expo-secure-store';

const ELEVENLABS_KEY = 'elevenlabs_api_key';

export async function saveElevenLabsKey(apiKey: string) {
  await SecureStore.setItemAsync(ELEVENLABS_KEY, apiKey.trim(), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getElevenLabsKey(): Promise<string | null> {
  return SecureStore.getItemAsync(ELEVENLABS_KEY);
}

export async function clearElevenLabsKey() {
  await SecureStore.deleteItemAsync(ELEVENLABS_KEY);
}

export async function hasElevenLabsKey(): Promise<boolean> {
  return (await getElevenLabsKey()) !== null;
}
```

### Step 3: Validate the key on save
When saving, immediately hit `GET https://api.elevenlabs.io/v1/user` with header
`xi-api-key: <key>` — 200 means the key works (show plan name/quota), 401 means an
invalid key, show an error and don't save.

```ts
export async function validateElevenLabsKey(apiKey: string): Promise<
  { valid: true; planName: string } | { valid: false; error: string }
> {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey.trim() },
    });
    if (res.status === 401) return { valid: false, error: 'Invalid API key' };
    if (!res.ok) return { valid: false, error: `ElevenLabs error (${res.status})` };
    const data = await res.json();
    return { valid: true, planName: data.subscription?.tier ?? 'unknown' };
  } catch {
    return { valid: false, error: 'Could not reach ElevenLabs' };
  }
}
```

### Step 4: Settings screen
New route `src/app/settings.tsx` (or a modal), with:
- a text field (`secureTextEntry` optional) for the key,
- a link opening `https://elevenlabs.io/app/settings/api-keys` in the browser
  (`expo-web-browser` → `WebBrowser.openBrowserAsync(...)`),
- a "Save" button → `validateElevenLabsKey` → if OK, `saveElevenLabsKey`,
- a status line: "Connected — plan: Creator" / "Not connected",
- a "Remove key" button → `clearElevenLabsKey`.

### Step 5: Replace all ElevenLabs call sites
Find the places in `src/lib/` that currently read
`process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY` (likely the STT module and the TTS module)
and replace with `await getElevenLabsKey()`, called right before the request (don't
cache it in a global variable permanently — the user might change/remove the key mid-session).

```ts
const apiKey = await getElevenLabsKey();
if (!apiKey) {
  throw new Error('MISSING_ELEVENLABS_KEY');
}
```

### Step 6: Handle a missing key in the UI
Where you catch the `MISSING_ELEVENLABS_KEY` error (recording/playback screen), show an
alert/banner "Add your ElevenLabs key in Settings" with a button leading to
`settings.tsx`. This also applies to `EXPO_PUBLIC_ELEVENLABS_VOICE_ID` — if this should
also be a user choice (their voice from the library), add a second field on the same
settings screen; if it's a fixed app voice, it can stay as a constant in code (it's not
a secret).

### Step 7: Force the settings screen on first launch (optional)
If you want the app to lead straight into key entry: in `src/app/index.tsx` check
`hasElevenLabsKey()` on startup and if `false`, redirect to `/settings` instead of the
voice screen.

### Step 8: Repo cleanup
- Remove `EXPO_PUBLIC_ELEVENLABS_API_KEY` and `EXPO_PUBLIC_ELEVENLABS_VOICE_ID`
  (if you're also making that dynamic) from `.env.local` and from `.env.example`
  if one exists.
- Update `README.md` ("Get started" section) — remove the instruction to paste the key
  into `.env.local`, add an instruction: "you enter the key inside the app, under Settings."
- Check `.gitignore` — make sure `.env.local` is ignored (a safety net regardless of the
  changes above).

### Step 9: Tests
- Unit test `secure-keys.test.ts` (mock `expo-secure-store`) — save/read/delete.
- Key validation test (mock `fetch`) — 200, 401, network error.
- Manual test on a real device: enter a wrong key → see an error; enter a correct key →
  recording and playback work; remove the key → the app correctly locks and redirects
  to Settings.

---

## Plan 2 — Anthropic key (intent parsing, Claude Haiku + tool use)

Same mechanism as Plan 1, a separate Keychain entry since it's a different provider.

### Step 1: Extend `secure-keys.ts`
```ts
const ANTHROPIC_KEY = 'anthropic_api_key';

export async function saveAnthropicKey(apiKey: string) {
  await SecureStore.setItemAsync(ANTHROPIC_KEY, apiKey.trim(), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function getAnthropicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(ANTHROPIC_KEY);
}

export async function clearAnthropicKey() {
  await SecureStore.deleteItemAsync(ANTHROPIC_KEY);
}
```

### Step 2: Validate the Anthropic key
Anthropic doesn't have a lightweight `/user` endpoint like ElevenLabs — the simplest
validation is sending a minimal request to `/v1/messages` (e.g. `max_tokens: 1`) and
checking status 200 vs 401.
```ts
export async function validateAnthropicKey(apiKey: string): Promise<
  { valid: true } | { valid: false; error: string }
> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (res.status === 401) return { valid: false, error: 'Invalid API key' };
    if (!res.ok && res.status !== 400) return { valid: false, error: `Anthropic error (${res.status})` };
    return { valid: true };
  } catch {
    return { valid: false, error: 'Could not reach Anthropic' };
  }
}
```
(A 400 status is also treated as "the key works" — it means authorization passed, only
the request body is too sparse.)

### Step 3: Second field on the settings screen
Same `settings.tsx` from Plan 1 — add a second section, "Anthropic key (Claude)", with
a link to `https://console.anthropic.com/settings/keys`, a field, validation, and a
status line.

### Step 4: Replace the call in the intent-parsing module
In `src/lib/` (the module that currently calls Claude with
`EXPO_PUBLIC_ANTHROPIC_API_KEY`), replace it with `await getAnthropicKey()`, the same as
Step 5 in Plan 1, throwing `MISSING_ANTHROPIC_KEY` the same way when the key is missing.

### Step 5: UX for a missing key
Since the Anthropic module sits mid-pipeline (after transcription, before acting on the
calendar), the error needs to surface on the same screen as the ElevenLabs error —
ideally one shared `MissingApiKeyBanner` component that takes
`provider: 'elevenlabs' | 'anthropic'`.

### Step 6: Repo cleanup
- Remove `EXPO_PUBLIC_ANTHROPIC_API_KEY` from `.env.local`.
- Update `README.md` the same way as for ElevenLabs.

### Step 7: Tests
Same as Plan 1: unit tests for save/read, validation tests (mock fetch: 200, 401, 400),
a manual end-to-end test on a device.

---

## Shared final step (for both plans)

1. **Full build cleanup**: after removing the variables from `.env.local`, run
   `npx expo prebuild --clean` and a fresh `npx expo run:ios`, to make sure no old key
   is left in the Metro/Hermes cache.
2. **Binary verification**: build a release build, unzip the `.ipa`
   (`unzip YourApp.ipa`), search the JS bundle
   (`grep -r "sk-ant\|xi-api" Payload/`) — nothing should be found.
3. **CLAUDE.md / AGENTS.md**: add a note that API keys are BYOK and must never be put
   back into `.env.local` / `app.json` / `EXPO_PUBLIC_*`.
4. **Onboarding screen**: consider a short first-launch screen explaining to the user
   why they need to provide two keys (ElevenLabs + Anthropic) and where to get them —
   otherwise the first impression of the app is "nothing works."
