import { ANTHROPIC_API_KEY } from '@/lib/voice-config';
import type { DraftEvent } from '@/lib/google-calendar-api';

export class ParseError extends Error {}

type AnthropicToolUseBlock = {
  type: 'tool_use';
  name: string;
  input: unknown;
};

type AnthropicMessagesResponse = {
  content: ({ type: string } & Record<string, unknown>)[];
};

const EXTRACT_EVENT_TOOL = {
  name: 'extract_event',
  description: 'Extract a structured calendar event from a spoken transcript.',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A short title for the event.' },
      startDateTime: {
        type: 'string',
        description:
          'The event start date and time as an ISO 8601 string that always includes an explicit UTC offset (e.g. 2026-08-23T15:00:00-07:00).',
      },
      durationMinutes: {
        type: 'number',
        description: 'The event duration in minutes, if mentioned or implied.',
      },
    },
    required: ['title', 'startDateTime'],
  },
};

export type DeleteSearchQuery = {
  searchQuery: string;
  dateHint?: string;
};

const EXTRACT_DELETE_TARGET_TOOL = {
  name: 'extract_delete_target',
  description: 'Extract a search query identifying which calendar event the user wants to delete from a spoken transcript.',
  input_schema: {
    type: 'object',
    properties: {
      searchQuery: {
        type: 'string',
        description: 'Keywords identifying the event, such as its title or topic.',
      },
      dateHint: {
        type: 'string',
        description:
          'The specific day the event is on, as an ISO 8601 date (YYYY-MM-DD), only if the user mentioned a date or day (e.g. "tomorrow", "next Tuesday"). Omit if no date was mentioned.',
      },
    },
    required: ['searchQuery'],
  },
};

export async function parseDeleteTargetFromTranscript(transcript: string): Promise<DeleteSearchQuery> {
  const now = new Date().toISOString();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      tools: [EXTRACT_DELETE_TARGET_TOOL],
      tool_choice: { type: 'tool', name: 'extract_delete_target' },
      messages: [
        {
          role: 'user',
          content: `Current date/time: ${now}\nTime zone: ${timeZone}\n\nTranscript: "${transcript}"`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new ParseError(`Claude API request failed with status ${response.status}`);
  }

  const data: AnthropicMessagesResponse = await response.json();
  const toolUseBlock = data.content.find(
    (block): block is AnthropicToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUseBlock) {
    throw new ParseError('Claude response did not include a tool_use block');
  }

  const input = toolUseBlock.input as Partial<DeleteSearchQuery>;

  if (!input.searchQuery) {
    throw new ParseError('Claude tool_use input is missing required fields');
  }

  return {
    searchQuery: input.searchQuery,
    ...(input.dateHint !== undefined ? { dateHint: input.dateHint } : {}),
  };
}

export async function parseEventFromTranscript(transcript: string): Promise<DraftEvent> {
  const now = new Date().toISOString();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      tools: [EXTRACT_EVENT_TOOL],
      tool_choice: { type: 'tool', name: 'extract_event' },
      messages: [
        {
          role: 'user',
          content: `Current date/time: ${now}\nTime zone: ${timeZone}\n\nTranscript: "${transcript}"`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new ParseError(`Claude API request failed with status ${response.status}`);
  }

  const data: AnthropicMessagesResponse = await response.json();
  const toolUseBlock = data.content.find(
    (block): block is AnthropicToolUseBlock => block.type === 'tool_use',
  );

  if (!toolUseBlock) {
    throw new ParseError('Claude response did not include a tool_use block');
  }

  const input = toolUseBlock.input as Partial<DraftEvent>;

  if (!input.title || !input.startDateTime) {
    throw new ParseError('Claude tool_use input is missing required fields');
  }

  return {
    title: input.title,
    startDateTime: input.startDateTime,
    ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
  };
}
