import { File, Paths } from 'expo-file-system';
import { ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID } from '@/lib/voice-config';

export class TtsApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`ElevenLabs Text-to-Speech request failed with status ${status}`);
    this.status = status;
  }
}

export async function synthesizeSpeech(text: string): Promise<string> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  });

  if (!response.ok) {
    throw new TtsApiError(response.status);
  }

  const audioBytes = await response.bytes();
  const file = new File(Paths.cache, `today-readout-${Date.now()}.mp3`);
  file.write(audioBytes);

  return file.uri;
}
