import * as SecureStore from 'expo-secure-store';
import {
  clearAnthropicKey,
  clearElevenLabsKey,
  clearElevenLabsVoiceId,
  getAnthropicKey,
  getElevenLabsKey,
  getElevenLabsVoiceId,
  hasAnthropicKey,
  hasElevenLabsKey,
  hasRequiredKeys,
  saveAnthropicKey,
  saveElevenLabsKey,
  saveElevenLabsVoiceId,
  validateAnthropicKey,
  validateElevenLabsKey,
} from './secure-keys';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
}));

const mockGetItemAsync = SecureStore.getItemAsync as jest.Mock;
const mockSetItemAsync = SecureStore.setItemAsync as jest.Mock;
const mockDeleteItemAsync = SecureStore.deleteItemAsync as jest.Mock;

describe('secure-keys', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ElevenLabs key', () => {
    it('saves a trimmed key with the device-only accessibility option', async () => {
      await saveElevenLabsKey('  sk-el-123  ');

      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'elevenlabs_api_key',
        'sk-el-123',
        expect.objectContaining({ keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' }),
      );
    });

    it('reads back the stored key', async () => {
      mockGetItemAsync.mockResolvedValue('sk-el-123');

      await expect(getElevenLabsKey()).resolves.toBe('sk-el-123');
      expect(mockGetItemAsync).toHaveBeenCalledWith('elevenlabs_api_key');
    });

    it('deletes the stored key', async () => {
      await clearElevenLabsKey();

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('elevenlabs_api_key');
    });

    it('reports present/absent via hasElevenLabsKey', async () => {
      mockGetItemAsync.mockResolvedValueOnce('sk-el-123');
      await expect(hasElevenLabsKey()).resolves.toBe(true);

      mockGetItemAsync.mockResolvedValueOnce(null);
      await expect(hasElevenLabsKey()).resolves.toBe(false);
    });
  });

  describe('ElevenLabs voice ID', () => {
    it('saves a trimmed voice id', async () => {
      await saveElevenLabsVoiceId('  custom-voice  ');

      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'elevenlabs_voice_id',
        'custom-voice',
        expect.objectContaining({ keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' }),
      );
    });

    it('returns the stored voice id when present', async () => {
      mockGetItemAsync.mockResolvedValue('custom-voice');

      await expect(getElevenLabsVoiceId()).resolves.toBe('custom-voice');
    });

    it('falls back to the default Rachel voice id when nothing is stored', async () => {
      mockGetItemAsync.mockResolvedValue(null);

      await expect(getElevenLabsVoiceId()).resolves.toBe('21m00Tcm4TlvDq8ikWAM');
    });

    it('deletes the stored voice id', async () => {
      await clearElevenLabsVoiceId();

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('elevenlabs_voice_id');
    });
  });

  describe('Anthropic key', () => {
    it('saves a trimmed key with the device-only accessibility option', async () => {
      await saveAnthropicKey('  sk-ant-123  ');

      expect(mockSetItemAsync).toHaveBeenCalledWith(
        'anthropic_api_key',
        'sk-ant-123',
        expect.objectContaining({ keychainAccessible: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY' }),
      );
    });

    it('reads back the stored key', async () => {
      mockGetItemAsync.mockResolvedValue('sk-ant-123');

      await expect(getAnthropicKey()).resolves.toBe('sk-ant-123');
      expect(mockGetItemAsync).toHaveBeenCalledWith('anthropic_api_key');
    });

    it('deletes the stored key', async () => {
      await clearAnthropicKey();

      expect(mockDeleteItemAsync).toHaveBeenCalledWith('anthropic_api_key');
    });

    it('reports present/absent via hasAnthropicKey', async () => {
      mockGetItemAsync.mockResolvedValueOnce('sk-ant-123');
      await expect(hasAnthropicKey()).resolves.toBe(true);

      mockGetItemAsync.mockResolvedValueOnce(null);
      await expect(hasAnthropicKey()).resolves.toBe(false);
    });
  });

  describe('hasRequiredKeys', () => {
    it('is true only when both the ElevenLabs and Anthropic keys are present', async () => {
      mockGetItemAsync.mockResolvedValueOnce('sk-el-123').mockResolvedValueOnce('sk-ant-123');
      await expect(hasRequiredKeys()).resolves.toBe(true);

      mockGetItemAsync.mockResolvedValueOnce('sk-el-123').mockResolvedValueOnce(null);
      await expect(hasRequiredKeys()).resolves.toBe(false);

      mockGetItemAsync.mockResolvedValueOnce(null).mockResolvedValueOnce('sk-ant-123');
      await expect(hasRequiredKeys()).resolves.toBe(false);
    });
  });

  describe('validateElevenLabsKey', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('returns valid with the plan tier on success', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ subscription: { tier: 'Creator' } }),
      });

      await expect(validateElevenLabsKey('sk-el-123')).resolves.toEqual({
        valid: true,
        planName: 'Creator',
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/user',
        expect.objectContaining({ headers: { 'xi-api-key': 'sk-el-123' } }),
      );
    });

    it('defaults planName to "unknown" when the tier is missing', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await expect(validateElevenLabsKey('sk-el-123')).resolves.toEqual({
        valid: true,
        planName: 'unknown',
      });
    });

    it('returns invalid on a 401', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

      await expect(validateElevenLabsKey('bad-key')).resolves.toEqual({
        valid: false,
        error: 'Invalid API key',
      });
    });

    it('returns a provider error on other non-ok statuses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

      await expect(validateElevenLabsKey('sk-el-123')).resolves.toEqual({
        valid: false,
        error: 'ElevenLabs error (500)',
      });
    });

    it('returns a network error message when fetch throws', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

      await expect(validateElevenLabsKey('sk-el-123')).resolves.toEqual({
        valid: false,
        error: 'Could not reach ElevenLabs',
      });
    });
  });

  describe('validateAnthropicKey', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('returns valid on a 200', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

      await expect(validateAnthropicKey('sk-ant-123')).resolves.toEqual({ valid: true });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'x-api-key': 'sk-ant-123' }),
        }),
      );
    });

    it('treats a 400 as valid (auth passed, sparse body rejected)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 400 });

      await expect(validateAnthropicKey('sk-ant-123')).resolves.toEqual({ valid: true });
    });

    it('returns invalid on a 401', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

      await expect(validateAnthropicKey('bad-key')).resolves.toEqual({
        valid: false,
        error: 'Invalid API key',
      });
    });

    it('returns a provider error on other non-ok statuses', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

      await expect(validateAnthropicKey('sk-ant-123')).resolves.toEqual({
        valid: false,
        error: 'Anthropic error (500)',
      });
    });

    it('returns a network error message when fetch throws', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

      await expect(validateAnthropicKey('sk-ant-123')).resolves.toEqual({
        valid: false,
        error: 'Could not reach Anthropic',
      });
    });
  });
});
