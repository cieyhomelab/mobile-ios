import { File, Paths } from 'expo-file-system';
import { getElevenLabsKey, getElevenLabsVoiceId } from '@/lib/secure-keys';

export class TtsApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`ElevenLabs Text-to-Speech request failed with status ${status}`);
    this.status = status;
  }
}

export async function synthesizeSpeech(text: string): Promise<string> {
  const apiKey = await getElevenLabsKey();
  if (!apiKey) throw new Error('MISSING_ELEVENLABS_KEY');
  const voiceId = await getElevenLabsVoiceId();

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
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
