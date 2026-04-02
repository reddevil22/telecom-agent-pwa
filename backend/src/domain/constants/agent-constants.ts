import type { ScreenType } from '../types/agent';

export const REPLY_MAP: Record<ScreenType, string> = {
  balance: 'Here is your current account balance.',
  bundles: 'Here are the bundles currently available for you.',
  usage: 'Here is a summary of your current usage this billing period.',
  support: 'Here are your support options and recent tickets.',
  unknown: "I'm not sure what you're looking for. Here are some things I can help with.",
};

export const SUGGESTION_MAP: Record<ScreenType, string[]> = {
  balance: ['What bundles are available?', 'Check my usage', 'I need support'],
  bundles: ['Show my balance', 'Check my usage', 'Activate Value Plus'],
  usage: ['Show my balance', 'What bundles are available?', 'I need support'],
  support: ['Show my balance', 'Check my usage', 'Create a new ticket'],
  unknown: ['Show my balance', 'What bundles are available?', 'Check my usage', 'I need support'],
};

export const TOOL_TO_SCREEN: Record<string, ScreenType> = {
  check_balance: 'balance',
  list_bundles: 'bundles',
  check_usage: 'usage',
  get_support: 'support',
};
