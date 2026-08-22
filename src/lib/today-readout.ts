import type { CalendarEvent } from './google-calendar-api';

export function formatTodayReadout(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return 'You have nothing on your calendar today.';
  }

  const list = events
    .map((event) =>
      event.allDay
        ? `${event.summary}, all day`
        : `${new Date(event.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} ${event.summary}`,
    )
    .join(', ');

  const eventWord = events.length === 1 ? 'event' : 'events';

  return `You have ${events.length} ${eventWord} today: ${list}.`;
}
