import { File } from 'expo-file-system';

import { getElevenLabsKey } from '@/lib/secure-keys';

export class SttApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`ElevenLabs Speech-to-Text request failed with status ${status}`);
    this.status = status;
  }
}

export async function transcribeAudio(fileUri: string): Promise<string> {
  const apiKey = await getElevenLabsKey();
  if (!apiKey) throw new Error('MISSING_ELEVENLABS_KEY');

  const formData = new FormData();
  formData.append('file', new File(fileUri));
  formData.append('model_id', 'scribe_v2');
  formData.append('language_code', 'en');

  const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  });

  if (!response.ok) {
    throw new SttApiError(response.status);
  }

  const data: { text: string } = await response.json();

  return data.text;
}
