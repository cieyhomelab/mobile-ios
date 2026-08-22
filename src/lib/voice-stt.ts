import { ELEVENLABS_API_KEY } from '@/lib/voice-config';

export class SttApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`ElevenLabs Speech-to-Text request failed with status ${status}`);
    this.status = status;
  }
}

export async function transcribeAudio(fileUri: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: 'recording.m4a',
    type: 'audio/m4a',
  } as unknown as Blob);
  formData.append('model_id', 'scribe_v2');
  formData.append('language_code', 'en');

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    body: formData,
  });

  if (!response.ok) {
    throw new SttApiError(response.status);
  }

  const data: { text: string } = await response.json();

  return data.text;
}
