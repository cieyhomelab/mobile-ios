import { ParseError, parseDeleteTargetFromTranscript, parseEventFromTranscript } from './event-parser';
import { getAnthropicKey } from '@/lib/secure-keys';

jest.mock('@/lib/secure-keys', () => ({
  getAnthropicKey: jest.fn(),
}));

const mockGetAnthropicKey = getAnthropicKey as jest.Mock;

describe('parseEventFromTranscript', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    mockGetAnthropicKey.mockResolvedValue('sk-ant-123');
  });

  it('sends the correct forced tool-use request shape', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            name: 'extract_event',
            input: { title: 'Team sync', startDateTime: '2026-08-23T15:00:00-07:00' },
          },
        ],
      }),
    });

    await parseEventFromTranscript('Book a meeting tomorrow at 3pm');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': expect.any(String),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'extract_event' });
    expect(body.tools[0].name).toBe('extract_event');
    expect(body.messages[0].content).toContain('Book a meeting tomorrow at 3pm');
    expect(body.messages[0].content).toMatch(/Time zone: .+/);
    expect(body.messages[0].content).toMatch(/Current date\/time: \d{4}-\d{2}-\d{2}T/);
  });

  it('maps a tool_use response to a DraftEvent', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            name: 'extract_event',
            input: {
              title: 'Dentist appointment',
              startDateTime: '2026-08-24T09:00:00-07:00',
              durationMinutes: 30,
            },
          },
        ],
      }),
    });

    const result = await parseEventFromTranscript('Dentist appointment tomorrow at 9am for 30 minutes');

    expect(result).toEqual({
      title: 'Dentist appointment',
      startDateTime: '2026-08-24T09:00:00-07:00',
      durationMinutes: 30,
    });
  });

  it('throws ParseError when no tool_use block is present', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'I could not parse that.' }] }),
    });

    await expect(parseEventFromTranscript('gibberish')).rejects.toThrow(ParseError);
  });

  it('throws ParseError on a non-2xx response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

    await expect(parseEventFromTranscript('Book a meeting tomorrow at 3pm')).rejects.toThrow(ParseError);
  });

  it('throws when no Anthropic key is stored', async () => {
    mockGetAnthropicKey.mockResolvedValue(null);

    await expect(parseEventFromTranscript('Book a meeting tomorrow at 3pm')).rejects.toThrow(
      'MISSING_ANTHROPIC_KEY',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('parseDeleteTargetFromTranscript', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    mockGetAnthropicKey.mockResolvedValue('sk-ant-123');
  });

  it('sends the correct forced tool-use request shape', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            name: 'extract_delete_target',
            input: { searchQuery: 'dentist appointment' },
          },
        ],
      }),
    });

    await parseDeleteTargetFromTranscript('Delete my dentist appointment');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': expect.any(String),
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'extract_delete_target' });
    expect(body.tools[0].name).toBe('extract_delete_target');
    expect(body.messages[0].content).toContain('Delete my dentist appointment');
    expect(body.messages[0].content).toMatch(/Time zone: .+/);
    expect(body.messages[0].content).toMatch(/Current date\/time: \d{4}-\d{2}-\d{2}T/);
  });

  it('maps a tool_use response with a dateHint to a DeleteSearchQuery', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            name: 'extract_delete_target',
            input: { searchQuery: 'dentist appointment', dateHint: '2026-08-24' },
          },
        ],
      }),
    });

    const result = await parseDeleteTargetFromTranscript("Delete tomorrow's dentist appointment");

    expect(result).toEqual({ searchQuery: 'dentist appointment', dateHint: '2026-08-24' });
  });

  it('maps a tool_use response without a dateHint to a DeleteSearchQuery', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            name: 'extract_delete_target',
            input: { searchQuery: 'team sync' },
          },
        ],
      }),
    });

    const result = await parseDeleteTargetFromTranscript('Delete the team sync');

    expect(result).toEqual({ searchQuery: 'team sync' });
  });

  it('maps a tool_use response with a timeHint to a DeleteSearchQuery', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            name: 'extract_delete_target',
            input: { searchQuery: '', dateHint: '2026-08-23', timeHint: '23:30' },
          },
        ],
      }),
    });

    const result = await parseDeleteTargetFromTranscript('Delete event 11:30 pm today');

    expect(result).toEqual({ searchQuery: '', dateHint: '2026-08-23', timeHint: '23:30' });
  });

  it('throws ParseError when no tool_use block is present', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text: 'I could not parse that.' }] }),
    });

    await expect(parseDeleteTargetFromTranscript('gibberish')).rejects.toThrow(ParseError);
  });

  it('throws ParseError on a non-2xx response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

    await expect(parseDeleteTargetFromTranscript('Delete my dentist appointment')).rejects.toThrow(ParseError);
  });

  it('throws when no Anthropic key is stored', async () => {
    mockGetAnthropicKey.mockResolvedValue(null);

    await expect(parseDeleteTargetFromTranscript('Delete my dentist appointment')).rejects.toThrow(
      'MISSING_ANTHROPIC_KEY',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
