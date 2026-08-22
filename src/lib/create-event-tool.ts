import { getAccessToken, signOutLocally } from './google-calendar-auth';
import { CalendarApiError, createEvent, findConflictingEvents } from './google-calendar-api';

export async function handleCreateEventTool(params: {
  title: string;
  startDateTime: string;
  durationMinutes?: number;
}): Promise<string> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return 'Unable to access your calendar right now. Please try again.';
  }

  const durationMinutes = params.durationMinutes ?? 60;
  const endDateTime = new Date(
    new Date(params.startDateTime).getTime() + durationMinutes * 60_000,
  ).toISOString();

  try {
    const conflicts = await findConflictingEvents(accessToken, params.startDateTime, endDateTime);
    if (conflicts.length > 0) {
      return `That time conflicts with an existing event, "${conflicts[0].summary}". Should I create it anyway or pick a different time?`;
    }

    const created = await createEvent(accessToken, {
      title: params.title,
      startDateTime: params.startDateTime,
      durationMinutes: params.durationMinutes,
    });
    return `Created "${created.summary}" on your calendar.`;
  } catch (error) {
    if (error instanceof CalendarApiError && error.status === 401) {
      await signOutLocally();
      return 'Your calendar access has expired. Please sign in again.';
    }
    return 'Something went wrong creating that event. Please try again.';
  }
}
