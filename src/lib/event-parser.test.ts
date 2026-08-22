import { ParseError, parseEventFromTranscript } from './event-parser';

describe('parseEventFromTranscript', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
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
});
