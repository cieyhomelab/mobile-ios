import {
  CalendarApiError,
  createEvent,
  deleteEvent,
  findConflictingEvents,
  listTodayEvents,
  searchEvents,
} from './google-calendar-api';

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

describe('searchEvents', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('sends q, timeMin, timeMax, singleEvents, and orderBy', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

    await searchEvents('token', 'dentist', '2026-08-23T00:00:00.000Z', '2026-09-22T00:00:00.000Z');

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.get('q')).toBe('dentist');
    expect(params.get('timeMin')).toBe('2026-08-23T00:00:00.000Z');
    expect(params.get('timeMax')).toBe('2026-09-22T00:00:00.000Z');
    expect(params.get('singleEvents')).toBe('true');
    expect(params.get('orderBy')).toBe('startTime');
  });

  it('returns the mapped events', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ id: 'e1', summary: 'Dentist checkup', start: { dateTime: '2026-08-24T09:00:00Z' } }],
      }),
    });

    const result = await searchEvents('token', 'dentist', '2026-08-23T00:00:00.000Z', '2026-09-22T00:00:00.000Z');

    expect(result).toEqual([{ id: 'e1', summary: 'Dentist checkup', start: '2026-08-24T09:00:00Z' }]);
  });

  it('returns an empty array when there are no matches', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

    const result = await searchEvents('token', 'nothing', '2026-08-23T00:00:00.000Z', '2026-09-22T00:00:00.000Z');

    expect(result).toEqual([]);
  });

  it('throws CalendarApiError on a non-2xx response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

    await expect(
      searchEvents('token', 'dentist', '2026-08-23T00:00:00.000Z', '2026-09-22T00:00:00.000Z'),
    ).rejects.toThrow(CalendarApiError);
  });

  it('omits the q parameter when query is empty', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

    await searchEvents('token', '', '2026-08-23T00:00:00.000Z', '2026-09-22T00:00:00.000Z');

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.has('q')).toBe(false);
  });
});

describe('deleteEvent', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('sends a DELETE request to the event URL with the auth header', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    await deleteEvent('token-123', 'event-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events/event-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
  });

  it('throws CalendarApiError on a non-2xx response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 404 });

    await expect(deleteEvent('token', 'event-1')).rejects.toThrow(CalendarApiError);
  });
});

describe('listTodayEvents', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 23, 12, 0, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('requests events bounded to local midnight-to-midnight for today', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

    await listTodayEvents('token');

    const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);

    expect(params.get('timeMin')).toBe(new Date(2026, 7, 23, 0, 0, 0, 0).toISOString());
    expect(params.get('timeMax')).toBe(new Date(2026, 7, 23, 23, 59, 59, 999).toISOString());
    expect(params.get('singleEvents')).toBe('true');
    expect(params.get('orderBy')).toBe('startTime');
  });

  it('flags date-only items as allDay and dateTime items as not allDay', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'e1', summary: 'Standup', start: { dateTime: '2026-08-23T09:00:00Z' } },
          { id: 'e2', summary: 'Conference', start: { date: '2026-08-23' } },
        ],
      }),
    });

    const result = await listTodayEvents('token');

    expect(result).toEqual([
      { id: 'e1', summary: 'Standup', start: '2026-08-23T09:00:00Z', allDay: false },
      { id: 'e2', summary: 'Conference', start: '2026-08-23', allDay: true },
    ]);
  });

  it('returns an empty array when there are no events today', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

    const result = await listTodayEvents('token');

    expect(result).toEqual([]);
  });

  it('throws CalendarApiError on a non-2xx response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 });

    await expect(listTodayEvents('token')).rejects.toThrow(CalendarApiError);
  });
});
