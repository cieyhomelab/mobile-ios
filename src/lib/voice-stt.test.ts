import { SttApiError, transcribeAudio } from './voice-stt';
import { getElevenLabsKey } from '@/lib/secure-keys';

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri })),
}));

jest.mock('@/lib/secure-keys', () => ({
  getElevenLabsKey: jest.fn(),
}));

const mockGetElevenLabsKey = getElevenLabsKey as jest.Mock;

class MockFormData {
  parts: [string, unknown][] = [];

  append(key: string, value: unknown): void {
    this.parts.push([key, value]);
  }

  get(key: string): unknown {
    return this.parts.find(([name]) => name === key)?.[1];
  }
}

describe('transcribeAudio', () => {
  const originalFormData = global.FormData;

  beforeEach(() => {
    global.fetch = jest.fn();
    global.FormData = MockFormData as unknown as typeof FormData;
    mockGetElevenLabsKey.mockResolvedValue('sk-el-123');
  });

  afterEach(() => {
    global.FormData = originalFormData;
  });

  it('sends the correct multipart request shape and returns the transcript', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'Book a meeting tomorrow at 3pm' }),
    });

    const result = await transcribeAudio('file:///tmp/recording.m4a');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.elevenlabs.io/v1/speech-to-text',
      expect.objectContaining({
        method: 'POST',
        headers: { 'xi-api-key': expect.any(String) },
      }),
    );

    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as MockFormData;
    expect(body.get('model_id')).toBe('scribe_v2');
    expect(body.get('language_code')).toBe('en');
    expect(body.get('file')).toEqual({ uri: 'file:///tmp/recording.m4a' });

    expect(result).toBe('Book a meeting tomorrow at 3pm');
  });

  it('throws SttApiError on a non-2xx response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 422 });

    await expect(transcribeAudio('file:///tmp/recording.m4a')).rejects.toThrow(SttApiError);
  });

  it('throws when no ElevenLabs key is stored', async () => {
    mockGetElevenLabsKey.mockResolvedValue(null);

    await expect(transcribeAudio('file:///tmp/recording.m4a')).rejects.toThrow(
      'MISSING_ELEVENLABS_KEY',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
