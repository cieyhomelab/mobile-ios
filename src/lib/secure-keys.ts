import * as SecureStore from 'expo-secure-store';

const ELEVENLABS_KEY = 'elevenlabs_api_key';
const ELEVENLABS_VOICE_ID_KEY = 'elevenlabs_voice_id';
const ANTHROPIC_KEY = 'anthropic_api_key';

// ElevenLabs' public premade "Rachel" voice — safe default, not a private voice.
const DEFAULT_ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

const SAVE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function saveElevenLabsKey(apiKey: string): Promise<void> {
  await SecureStore.setItemAsync(ELEVENLABS_KEY, apiKey.trim(), SAVE_OPTIONS);
}

export async function getElevenLabsKey(): Promise<string | null> {
  return SecureStore.getItemAsync(ELEVENLABS_KEY);
}

export async function clearElevenLabsKey(): Promise<void> {
  await SecureStore.deleteItemAsync(ELEVENLABS_KEY);
}

export async function hasElevenLabsKey(): Promise<boolean> {
  return (await getElevenLabsKey()) !== null;
}

export async function saveElevenLabsVoiceId(voiceId: string): Promise<void> {
  await SecureStore.setItemAsync(ELEVENLABS_VOICE_ID_KEY, voiceId.trim(), SAVE_OPTIONS);
}

export async function getElevenLabsVoiceId(): Promise<string> {
  const stored = await SecureStore.getItemAsync(ELEVENLABS_VOICE_ID_KEY);
  return stored ?? DEFAULT_ELEVENLABS_VOICE_ID;
}

export async function clearElevenLabsVoiceId(): Promise<void> {
  await SecureStore.deleteItemAsync(ELEVENLABS_VOICE_ID_KEY);
}

export async function saveAnthropicKey(apiKey: string): Promise<void> {
  await SecureStore.setItemAsync(ANTHROPIC_KEY, apiKey.trim(), SAVE_OPTIONS);
}

export async function getAnthropicKey(): Promise<string | null> {
  return SecureStore.getItemAsync(ANTHROPIC_KEY);
}

export async function clearAnthropicKey(): Promise<void> {
  await SecureStore.deleteItemAsync(ANTHROPIC_KEY);
}

export async function hasAnthropicKey(): Promise<boolean> {
  return (await getAnthropicKey()) !== null;
}

export async function hasRequiredKeys(): Promise<boolean> {
  const [elevenLabs, anthropic] = await Promise.all([hasElevenLabsKey(), hasAnthropicKey()]);
  return elevenLabs && anthropic;
}

export async function validateElevenLabsKey(
  apiKey: string,
): Promise<{ valid: true; planName: string } | { valid: false; error: string }> {
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

export async function validateAnthropicKey(
  apiKey: string,
): Promise<{ valid: true } | { valid: false; error: string }> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });
    if (res.status === 401) return { valid: false, error: 'Invalid API key' };
    // 400 means auth passed but the deliberately-sparse body was rejected — still a valid key.
    if (!res.ok && res.status !== 400) {
      return { valid: false, error: `Anthropic error (${res.status})` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Could not reach Anthropic' };
  }
}
