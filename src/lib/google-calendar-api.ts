export type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  allDay?: boolean;
};

type CalendarEventsListResponse = {
  items?: {
    id: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
  }[];
};

export type DraftEvent = {
  title: string;
  startDateTime: string;
  durationMinutes?: number;
};

export class CalendarApiError extends Error {
  status: number;

  constructor(status: number) {
    super(`Calendar API request failed with status ${status}`);
    this.status = status;
  }
}

export async function listUpcomingEvents(accessToken: string, maxResults = 5): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    throw new CalendarApiError(response.status);
  }

  const data: CalendarEventsListResponse = await response.json();

  return (data.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary ?? '(no title)',
    start: item.start?.dateTime ?? item.start?.date ?? '',
  }));
}

export async function findConflictingEvents(
  accessToken: string,
  startDateTime: string,
  endDateTime: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: startDateTime,
    timeMax: endDateTime,
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    throw new CalendarApiError(response.status);
  }

  const data: CalendarEventsListResponse = await response.json();

  return (data.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary ?? '(no title)',
    start: item.start?.dateTime ?? item.start?.date ?? '',
  }));
}

export async function listTodayEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    throw new CalendarApiError(response.status);
  }

  const data: CalendarEventsListResponse = await response.json();

  return (data.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary ?? '(no title)',
    start: item.start?.dateTime ?? item.start?.date ?? '',
    allDay: item.start?.dateTime === undefined,
  }));
}

export async function searchEvents(
  accessToken: string,
  query: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    q: query,
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    throw new CalendarApiError(response.status);
  }

  const data: CalendarEventsListResponse = await response.json();

  return (data.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary ?? '(no title)',
    start: item.start?.dateTime ?? item.start?.date ?? '',
  }));
}

export async function deleteEvent(accessToken: string, eventId: string): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    throw new CalendarApiError(response.status);
  }
}

export async function createEvent(accessToken: string, event: DraftEvent): Promise<CalendarEvent> {
  const durationMinutes = event.durationMinutes ?? 60;
  const start = new Date(event.startDateTime);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: event.title,
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
    }),
  });

  if (!response.ok) {
    throw new CalendarApiError(response.status);
  }

  const data: { id: string; summary?: string; start?: { dateTime?: string; date?: string } } = await response.json();

  return {
    id: data.id,
    summary: data.summary ?? '(no title)',
    start: data.start?.dateTime ?? data.start?.date ?? '',
  };
}
