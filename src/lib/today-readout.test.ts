import type { CalendarEvent } from './google-calendar-api';
import { formatTodayReadout } from './today-readout';

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

describe('formatTodayReadout', () => {
  it('returns the empty-day message when there are no events', () => {
    expect(formatTodayReadout([])).toBe('You have nothing on your calendar today.');
  });

  it('uses singular "event" for exactly one timed event', () => {
    const events: CalendarEvent[] = [{ id: 'e1', summary: 'Standup', start: '2026-08-23T09:00:00Z' }];

    expect(formatTodayReadout(events)).toBe(`You have 1 event today: ${time('2026-08-23T09:00:00Z')} Standup.`);
  });

  it('uses plural "events" and joins multiple timed events', () => {
    const events: CalendarEvent[] = [
      { id: 'e1', summary: 'Standup', start: '2026-08-23T09:00:00Z' },
      { id: 'e2', summary: 'Dentist', start: '2026-08-23T13:00:00Z' },
      { id: 'e3', summary: 'Team sync', start: '2026-08-23T16:00:00Z' },
    ];

    expect(formatTodayReadout(events)).toBe(
      `You have 3 events today: ${time('2026-08-23T09:00:00Z')} Standup, ${time('2026-08-23T13:00:00Z')} Dentist, ${time('2026-08-23T16:00:00Z')} Team sync.`,
    );
  });

  it('phrases all-day events distinctly and mixes them with timed events', () => {
    const events: CalendarEvent[] = [
      { id: 'e1', summary: 'Conference', start: '2026-08-23', allDay: true },
      { id: 'e2', summary: 'Standup', start: '2026-08-23T09:00:00Z' },
    ];

    expect(formatTodayReadout(events)).toBe(
      `You have 2 events today: Conference, all day, ${time('2026-08-23T09:00:00Z')} Standup.`,
    );
  });
});
