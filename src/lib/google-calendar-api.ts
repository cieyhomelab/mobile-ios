export type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
};

type CalendarEventsListResponse = {
  items?: {
    id: string;
    summary?: string;
    start?: { dateTime?: string; date?: string };
  }[];
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
