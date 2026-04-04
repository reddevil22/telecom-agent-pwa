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
  {
    type: 'function',
    function: {
      name: 'purchase_bundle',
      description:
        'Purchase or activate a specific bundle for the user. The user must have sufficient balance. Requires the bundleId (use IDs from the bundle listing like "b1", "b2", etc.).',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID' },
          bundleId: { type: 'string', description: 'The bundle ID to purchase (e.g. "b1", "b2")' },
        },
        required: ['userId', 'bundleId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'top_up',
      description:
        'Top up, recharge, or add credit to the user account balance. Use when the user wants to add money to their account.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID' },
          amount: { type: 'string', description: 'The amount to top up (e.g. "20", "50")' },
        },
        required: ['userId', 'amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_ticket',
      description:
        'Create a new support ticket for the user. Use when the user describes a problem, complaint, or issue they want tracked as a ticket.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The user ID' },
          subject: { type: 'string', description: 'Short summary of the issue' },
          description: { type: 'string', description: 'Detailed description of the problem' },
        },
        required: ['userId', 'subject', 'description'],
      },
    },
  },
];
