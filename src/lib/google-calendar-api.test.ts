import { CalendarApiError, createEvent, findConflictingEvents } from './google-calendar-api';

describe('createEvent', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('sends the correct request shape and returns the mapped event', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'event-1',
        summary: 'Team sync',
        start: { dateTime: '2026-08-23T15:00:00.000Z' },
      }),
    });

    const result = await createEvent('token-123', {
      title: 'Team sync',
      startDateTime: '2026-08-23T15:00:00-07:00',
      durationMinutes: 30,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'Content-Type': 'application/json',
        }),
      }),
    );

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.summary).toBe('Team sync');
    expect(body.start.dateTime).toBe(new Date('2026-08-23T15:00:00-07:00').toISOString());
    expect(body.end.dateTime).toBe(
      new Date(new Date('2026-08-23T15:00:00-07:00').getTime() + 30 * 60_000).toISOString(),
    );

    expect(result).toEqual({
      id: 'event-1',
      summary: 'Team sync',
      start: '2026-08-23T15:00:00.000Z',
    });
  });

  it('defaults duration to 60 minutes when omitted', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'event-2', summary: 'Dentist', start: {} }),
    });

    await createEvent('token', { title: 'Dentist', startDateTime: '2026-08-23T15:00:00-07:00' });

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.end.dateTime).toBe(
      new Date(new Date('2026-08-23T15:00:00-07:00').getTime() + 60 * 60_000).toISOString(),
    );
  });

  it('throws CalendarApiError on a non-2xx response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 403 });

    await expect(
      createEvent('token', { title: 'Nope', startDateTime: '2026-08-23T15:00:00-07:00' }),
    ).rejects.toThrow(CalendarApiError);
  });
});

describe('findConflictingEvents', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('returns overlapping events', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ id: 'e1', summary: 'Existing meeting', start: { dateTime: '2026-08-23T15:00:00Z' } }],
      }),
    });

    const result = await findConflictingEvents('token', '2026-08-23T15:00:00Z', '2026-08-23T16:00:00Z');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('timeMin=2026-08-23T15%3A00%3A00Z'),
      expect.any(Object),
    );
    expect(result).toEqual([{ id: 'e1', summary: 'Existing meeting', start: '2026-08-23T15:00:00Z' }]);
  });

  it('returns an empty array when there are no conflicts', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

    const result = await findConflictingEvents('token', '2026-08-23T15:00:00Z', '2026-08-23T16:00:00Z');

    expect(result).toEqual([]);
  });

  it('throws CalendarApiError on a non-2xx response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

    await expect(
      findConflictingEvents('token', '2026-08-23T15:00:00Z', '2026-08-23T16:00:00Z'),
    ).rejects.toThrow(CalendarApiError);
  });
});
