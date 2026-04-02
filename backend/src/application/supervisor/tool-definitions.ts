import type { LlmToolDefinition } from '../../domain/ports/llm.port';

export const TOOL_DEFINITIONS: LlmToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'check_balance',
      description:
        'Check the user account balance, credit, or airtime. Use when the user asks about their balance, how much credit they have, or their account status.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID' },
        },
        required: ['userId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_bundles',
      description:
        'List available bundles, plans, packages, or offers. Use when the user asks about available plans, wants to buy a bundle, or compare packages.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID' },
        },
        required: ['userId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_usage',
      description:
        'Check the user current usage, consumption, or remaining allowances. Use when the user asks about how much data/minutes/SMS they have used or have left.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID' },
        },
        required: ['userId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_support',
      description:
        'Get support options, help, create or view tickets, or answer questions about problems and complaints. Use when the user needs help, has a problem, or wants to contact support.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID' },
        },
        required: ['userId'],
      },
    },
  },
];
