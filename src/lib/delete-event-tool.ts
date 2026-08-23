import { getAccessToken, signOutLocally } from './google-calendar-auth';
import { CalendarApiError, CalendarEvent, deleteEvent, searchEvents } from './google-calendar-api';
import { DeleteSearchQuery } from './event-parser';

export type EventMatch = {
  event: CalendarEvent;
  matchCount: number;
};

const UPCOMING_WINDOW_DAYS = 30;

function resolveSearchWindow(dateHint?: string): { timeMin: string; timeMax: string } {
  if (dateHint) {
    const [year, month, day] = dateHint.split('-').map(Number);
    const timeMin = new Date(year, month - 1, day, 0, 0, 0, 0);
    const timeMax = new Date(year, month - 1, day, 23, 59, 59, 999);
    return { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() };
  }

  const now = new Date();
  const timeMax = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { timeMin: now.toISOString(), timeMax: timeMax.toISOString() };
}

export async function findEventToDelete(
  target: DeleteSearchQuery,
  onUnauthorized?: () => void,
): Promise<EventMatch | { error: string }> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { error: 'Unable to access your calendar right now. Please try again.' };
  }

  try {
    const { timeMin, timeMax } = resolveSearchWindow(target.dateHint);
    const matches = await searchEvents(accessToken, target.searchQuery, timeMin, timeMax);

    if (matches.length === 0) {
      return { error: "I couldn't find a matching event to delete." };
    }

    return { event: matches[0], matchCount: matches.length };
  } catch (error) {
    if (error instanceof CalendarApiError && error.status === 401) {
      await signOutLocally();
      onUnauthorized?.();
      return { error: 'Your calendar access has expired. Please sign in again.' };
    }
    return { error: 'Something went wrong finding that event. Please try again.' };
  }
}

export async function handleDeleteEventTool(
  eventId: string,
  onUnauthorized?: () => void,
): Promise<string> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return 'Unable to access your calendar right now. Please try again.';
  }

  try {
    await deleteEvent(accessToken, eventId);
    return 'Deleted that event from your calendar.';
  } catch (error) {
    if (error instanceof CalendarApiError && error.status === 401) {
      await signOutLocally();
      onUnauthorized?.();
      return 'Your calendar access has expired. Please sign in again.';
    }
    return 'Something went wrong deleting that event. Please try again.';
  }
}
