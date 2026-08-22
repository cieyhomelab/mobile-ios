import { handleCreateEventTool } from './create-event-tool';
import { getAccessToken, signOutLocally } from './google-calendar-auth';
import { CalendarApiError, createEvent, findConflictingEvents } from './google-calendar-api';

jest.mock('./google-calendar-auth', () => ({
  getAccessToken: jest.fn(),
  signOutLocally: jest.fn(),
}));
jest.mock('./google-calendar-api', () => ({
  ...jest.requireActual('./google-calendar-api'),
  createEvent: jest.fn(),
  findConflictingEvents: jest.fn(),
}));

const mockGetAccessToken = getAccessToken as jest.Mock;
const mockSignOutLocally = signOutLocally as jest.Mock;
const mockCreateEvent = createEvent as jest.Mock;
const mockFindConflictingEvents = findConflictingEvents as jest.Mock;

describe('handleCreateEventTool', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetAccessToken.mockResolvedValue('token-123');
  });

  it('creates the event when there is no conflict', async () => {
    mockFindConflictingEvents.mockResolvedValue([]);
    mockCreateEvent.mockResolvedValue({ id: 'e1', summary: 'Team sync', start: '2026-08-23T15:00:00Z' });

    const result = await handleCreateEventTool({
      title: 'Team sync',
      startDateTime: '2026-08-23T15:00:00-07:00',
    });

    expect(mockCreateEvent).toHaveBeenCalledWith('token-123', {
      title: 'Team sync',
      startDateTime: '2026-08-23T15:00:00-07:00',
      durationMinutes: undefined,
    });
    expect(result).toContain('Team sync');
  });

  it('returns a conflict description and does not create the event', async () => {
    mockFindConflictingEvents.mockResolvedValue([
      { id: 'existing', summary: 'Dentist', start: '2026-08-23T15:00:00Z' },
    ]);

    const result = await handleCreateEventTool({
      title: 'Team sync',
      startDateTime: '2026-08-23T15:00:00-07:00',
    });

    expect(mockCreateEvent).not.toHaveBeenCalled();
    expect(result).toContain('Dentist');
  });

  it('returns an error string on a non-401 API failure', async () => {
    mockFindConflictingEvents.mockRejectedValue(new CalendarApiError(500));

    const result = await handleCreateEventTool({
      title: 'Team sync',
      startDateTime: '2026-08-23T15:00:00-07:00',
    });

    expect(mockSignOutLocally).not.toHaveBeenCalled();
    expect(result).toMatch(/went wrong/i);
  });

  it('signs out and returns an error string on a 401', async () => {
    mockFindConflictingEvents.mockRejectedValue(new CalendarApiError(401));

    const result = await handleCreateEventTool({
      title: 'Team sync',
      startDateTime: '2026-08-23T15:00:00-07:00',
    });

    expect(mockSignOutLocally).toHaveBeenCalled();
    expect(result).toMatch(/sign in again/i);
  });

  it('returns an error string when no access token is available', async () => {
    mockGetAccessToken.mockResolvedValue(null);

    const result = await handleCreateEventTool({
      title: 'Team sync',
      startDateTime: '2026-08-23T15:00:00-07:00',
    });

    expect(mockFindConflictingEvents).not.toHaveBeenCalled();
    expect(result).toMatch(/unable to access/i);
  });
});
