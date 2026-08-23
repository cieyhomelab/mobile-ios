import { findEventToDelete, handleDeleteEventTool } from './delete-event-tool';
import { getAccessToken, signOutLocally } from './google-calendar-auth';
import { CalendarApiError, deleteEvent, searchEvents } from './google-calendar-api';

jest.mock('./google-calendar-auth', () => ({
  getAccessToken: jest.fn(),
  signOutLocally: jest.fn(),
}));
jest.mock('./google-calendar-api', () => ({
  ...jest.requireActual('./google-calendar-api'),
  deleteEvent: jest.fn(),
  searchEvents: jest.fn(),
}));

const mockGetAccessToken = getAccessToken as jest.Mock;
const mockSignOutLocally = signOutLocally as jest.Mock;
const mockDeleteEvent = deleteEvent as jest.Mock;
const mockSearchEvents = searchEvents as jest.Mock;

describe('findEventToDelete', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetAccessToken.mockResolvedValue('token-123');
    jest.useFakeTimers().setSystemTime(new Date(2026, 7, 23, 12, 0, 0, 0));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the soonest match and the match count', async () => {
    mockSearchEvents.mockResolvedValue([
      { id: 'e1', summary: 'Dentist', start: '2026-08-24T09:00:00Z' },
      { id: 'e2', summary: 'Dentist follow-up', start: '2026-08-30T09:00:00Z' },
    ]);

    const result = await findEventToDelete({ searchQuery: 'dentist' });

    expect(result).toEqual({
      event: { id: 'e1', summary: 'Dentist', start: '2026-08-24T09:00:00Z' },
      matchCount: 2,
    });
  });

  it('resolves the mentioned day as a local midnight-to-midnight window when dateHint is present', async () => {
    mockSearchEvents.mockResolvedValue([]);

    await findEventToDelete({ searchQuery: 'dentist', dateHint: '2026-08-24' });

    expect(mockSearchEvents).toHaveBeenCalledWith(
      'token-123',
      'dentist',
      new Date(2026, 7, 24, 0, 0, 0, 0).toISOString(),
      new Date(2026, 7, 24, 23, 59, 59, 999).toISOString(),
    );
  });

  it('resolves a 30-day-forward window from now when dateHint is absent', async () => {
    mockSearchEvents.mockResolvedValue([]);

    await findEventToDelete({ searchQuery: 'dentist' });

    const now = new Date(2026, 7, 23, 12, 0, 0, 0);
    expect(mockSearchEvents).toHaveBeenCalledWith(
      'token-123',
      'dentist',
      now.toISOString(),
      new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    );
  });

  it('returns a not-found error when there are no matches', async () => {
    mockSearchEvents.mockResolvedValue([]);

    const result = await findEventToDelete({ searchQuery: 'nothing' });

    expect(result).toEqual({ error: "I couldn't find a matching event to delete." });
  });

  it('signs out and returns an error string on a 401', async () => {
    mockSearchEvents.mockRejectedValue(new CalendarApiError(401));

    const result = await findEventToDelete({ searchQuery: 'dentist' });

    expect(mockSignOutLocally).toHaveBeenCalled();
    expect(result).toEqual({ error: 'Your calendar access has expired. Please sign in again.' });
  });

  it('returns a generic error string on a non-401 API failure', async () => {
    mockSearchEvents.mockRejectedValue(new CalendarApiError(500));

    const result = await findEventToDelete({ searchQuery: 'dentist' });

    expect(mockSignOutLocally).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Something went wrong finding that event. Please try again.' });
  });

  it('returns an error string when no access token is available', async () => {
    mockGetAccessToken.mockResolvedValue(null);

    const result = await findEventToDelete({ searchQuery: 'dentist' });

    expect(mockSearchEvents).not.toHaveBeenCalled();
    expect(result).toEqual({ error: 'Unable to access your calendar right now. Please try again.' });
  });
});

describe('handleDeleteEventTool', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetAccessToken.mockResolvedValue('token-123');
  });

  it('deletes the event and returns a success string', async () => {
    mockDeleteEvent.mockResolvedValue(undefined);

    const result = await handleDeleteEventTool('event-1');

    expect(mockDeleteEvent).toHaveBeenCalledWith('token-123', 'event-1');
    expect(result).toMatch(/deleted/i);
  });

  it('signs out and returns an error string on a 401', async () => {
    mockDeleteEvent.mockRejectedValue(new CalendarApiError(401));

    const result = await handleDeleteEventTool('event-1');

    expect(mockSignOutLocally).toHaveBeenCalled();
    expect(result).toMatch(/sign in again/i);
  });

  it('returns an error string on a non-401 API failure', async () => {
    mockDeleteEvent.mockRejectedValue(new CalendarApiError(500));

    const result = await handleDeleteEventTool('event-1');

    expect(mockSignOutLocally).not.toHaveBeenCalled();
    expect(result).toMatch(/went wrong/i);
  });

  it('returns an error string when no access token is available', async () => {
    mockGetAccessToken.mockResolvedValue(null);

    const result = await handleDeleteEventTool('event-1');

    expect(mockDeleteEvent).not.toHaveBeenCalled();
    expect(result).toMatch(/unable to access/i);
  });
});
