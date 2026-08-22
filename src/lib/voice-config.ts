// Real values come from .env.local (gitignored) as EXPO_PUBLIC_* vars.
// ElevenLabs: https://elevenlabs.io/app/settings/api-keys (key).
// Anthropic: https://console.anthropic.com/settings/keys (key).
export const ELEVENLABS_API_KEY =
  process.env.EXPO_PUBLIC_ELEVENLABS_API_KEY ?? 'PLACEHOLDER_ELEVENLABS_API_KEY';
export const ANTHROPIC_API_KEY =
  process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? 'PLACEHOLDER_ANTHROPIC_API_KEY';
// ElevenLabs voice library: https://elevenlabs.io/app/voice-library
export const ELEVENLABS_VOICE_ID =
  process.env.EXPO_PUBLIC_ELEVENLABS_VOICE_ID ?? 'PLACEHOLDER_ELEVENLABS_VOICE_ID';
