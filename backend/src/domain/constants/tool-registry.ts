import type { ScreenType } from '../types/agent';
import type { LlmToolDefinition } from '../ports/llm.port';

export interface ToolMetadata {
  name: string;
  screenType: ScreenType;
  allowedArgs: readonly string[];
  replyText: string;
  suggestions: readonly string[];
  description: string;
  parameters: Record<string, unknown>;
}

export const TOOL_REGISTRY: Record<string, ToolMetadata> = {
  check_balance: {
    name: 'check_balance',
    screenType: 'balance',
    allowedArgs: ['userId'],
    replyText: 'Here is your current account balance.',
    suggestions: ['What bundles are available?', 'Check my usage', 'I need support'],
    description: 'Check the user account balance, credit, or airtime. Use when the user asks about their balance, how much credit they have, or their account status.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
      },
      required: ['userId'],
    },
  },
  list_bundles: {
    name: 'list_bundles',
    screenType: 'bundles',
    allowedArgs: ['userId'],
    replyText: 'Here are the bundles currently available for you.',
    suggestions: ['Show my balance', 'Check my usage', 'View Value Plus details'],
    description: 'List available bundles, plans, packages, or offers. Use when the user asks about available plans or wants to compare packages.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
      },
      required: ['userId'],
    },
  },
  view_bundle_details: {
    name: 'view_bundle_details',
    screenType: 'bundleDetail',
    allowedArgs: ['userId', 'bundleId'],
    replyText: 'Here are the details for this bundle.',
    suggestions: ['Confirm purchase', 'Show my balance', 'View other bundles'],
    description: 'CRITICAL: Use this tool FIRST when the user wants to buy, purchase, or view details of a specific bundle. Shows detailed information including price, features, and balance check. Presents a confirmation screen where the user can review before purchasing. Available bundle IDs: b1 (Starter Pack), b2 (Value Plus), b3 (Unlimited Pro), b4 (Weekend Pass), b5 (Travel Roaming). NEVER skip this step - always show details first!',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
        bundleId: { type: 'string', description: 'The bundle ID to view details for. Must be one of: b1, b2, b3, b4, b5' },
      },
      required: ['userId', 'bundleId'],
    },
  },
  check_usage: {
    name: 'check_usage',
    screenType: 'usage',
    allowedArgs: ['userId'],
    replyText: 'Here is a summary of your current usage this billing period.',
    suggestions: ['Show my balance', 'What bundles are available?', 'I need support'],
    description: 'Check the user current usage, consumption, or remaining allowances. Use when the user asks about how much data/minutes/SMS they have used or have left.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
      },
      required: ['userId'],
    },
  },
  get_support: {
    name: 'get_support',
    screenType: 'support',
    allowedArgs: ['userId'],
    replyText: 'Here are your support options and recent tickets.',
    suggestions: ['Show my balance', 'Check my usage', 'Create a new ticket'],
    description: 'Get support options, help, create or view tickets, or answer questions about problems and complaints. Use when the user needs help, has a problem, or wants to contact support.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
      },
      required: ['userId'],
    },
  },
  purchase_bundle: {
    name: 'purchase_bundle',
    screenType: 'confirmation',
    allowedArgs: ['userId', 'bundleId'],
    replyText: 'Your request has been processed.',
    suggestions: ['Show my balance', 'What bundles are available?', 'Check my usage'],
    description: 'Purchase or activate a specific bundle for the user. ONLY use this tool AFTER the user has viewed bundle details and explicitly confirmed they want to purchase. Do NOT use this for initial purchase requests - use view_bundle_details first. Available bundle IDs: b1 (Starter Pack), b2 (Value Plus), b3 (Unlimited Pro), b4 (Weekend Pass), b5 (Travel Roaming).',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
        bundleId: { type: 'string', description: 'The bundle ID to purchase. Must be one of: b1, b2, b3, b4, b5' },
      },
      required: ['userId', 'bundleId'],
    },
  },
  top_up: {
    name: 'top_up',
    screenType: 'confirmation',
    allowedArgs: ['userId', 'amount'],
    replyText: 'Your request has been processed.',
    suggestions: ['Show my balance', 'What bundles are available?', 'Check my usage'],
    description: 'Top up, recharge, or add credit to the user account balance. Use when the user wants to add money to their account.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
        amount: { type: 'string', description: 'The amount to top up (e.g. "20", "50")' },
      },
      required: ['userId', 'amount'],
    },
  },
  create_ticket: {
    name: 'create_ticket',
    screenType: 'confirmation',
    allowedArgs: ['userId', 'subject', 'description'],
    replyText: 'Your request has been processed.',
    suggestions: ['Show my balance', 'What bundles are available?', 'Check my usage'],
    description: 'Create a new support ticket for the user. Use when the user describes a problem, complaint, or issue they want tracked as a ticket.',
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
  get_account_summary: {
    name: 'get_account_summary',
    screenType: 'account',
    allowedArgs: ['userId'],
    replyText: 'Here is your account overview.',
    suggestions: ['Show my balance', 'Check my usage', 'What bundles are available?'],
    description: 'Get a comprehensive account overview including profile, active subscriptions, recent transactions, and open tickets. Use when the user asks for "my account", "account overview", "my dashboard", "my profile", or wants a summary of everything.',
    parameters: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'The user ID' },
      },
      required: ['userId'],
    },
  },
};

// Derived constants for backward compatibility
export const ALLOWED_TOOLS: ReadonlySet<string> = new Set(Object.keys(TOOL_REGISTRY));

export const TOOL_TO_SCREEN: Record<string, ScreenType> = Object.fromEntries(
  Object.entries(TOOL_REGISTRY).map(([name, meta]) => [name, meta.screenType])
);

export const TOOL_ARG_SCHEMAS: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  Object.entries(TOOL_REGISTRY).map(([name, meta]) => [name, meta.allowedArgs])
);

export const REPLY_MAP: Record<ScreenType, string> = {
  balance: 'Here is your current account balance.',
  bundles: 'Here are the bundles currently available for you.',
  bundleDetail: 'Here are the details for this bundle.',
  usage: 'Here is a summary of your current usage this billing period.',
  support: 'Here are your support options and recent tickets.',
  confirmation: 'Your request has been processed.',
  account: 'Here is your account overview.',
  unknown: "I'm not sure what you're looking for. Here are some things I can help with.",
};

export const SUGGESTION_MAP: Record<ScreenType, string[]> = {
  balance: ['What bundles are available?', 'Check my usage', 'I need support'],
  bundles: ['Show my balance', 'Check my usage', 'View Value Plus details'],
  bundleDetail: ['Confirm purchase', 'Show my balance', 'View other bundles'],
  usage: ['Show my balance', 'What bundles are available?', 'I need support'],
  support: ['Show my balance', 'Check my usage', 'Create a new ticket'],
  confirmation: ['Show my balance', 'What bundles are available?', 'Check my usage'],
  account: ['Show my balance', 'Check my usage', 'What bundles are available?'],
  unknown: ['Show my balance', 'What bundles are available?', 'Check my usage', 'I need support'],
};

// Generate LLM tool definitions from registry
export function generateToolDefinitions(): LlmToolDefinition[] {
  return Object.values(TOOL_REGISTRY).map(meta => ({
    type: 'function',
    function: {
      name: meta.name,
      description: meta.description,
      parameters: meta.parameters,
    },
  }));
}
