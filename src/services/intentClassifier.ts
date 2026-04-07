import type { ScreenType } from '../types/agent';

const KEYWORD_MAP: Record<ScreenType, string[]> = {
  balance: ['balance', 'credit', 'top-up', 'topup', 'recharge', 'account', 'money', 'funds', 'airtime'],
  bundles: ['bundle', 'plan', 'package', 'offer', 'deal', 'subscription', 'data plan'],
  bundleDetail: ['details', 'view bundle', 'bundle details'],
  usage: ['usage', 'consume', 'used', 'remaining', 'data left', 'minutes used', 'how much', 'consume'],
  support: ['help', 'support', 'issue', 'problem', 'complaint', 'ticket', 'fault', 'not working', 'broken', 'fix'],
  confirmation: [],
  account: ['my account', 'account summary', 'account overview', 'profile', 'dashboard'],
  unknown: [],
};

export function classifyIntent(prompt: string): ScreenType {
  const lower = prompt.toLowerCase().trim();

  for (const [screenType, keywords] of Object.entries(KEYWORD_MAP) as [ScreenType, string[]][]) {
    if (screenType === 'unknown') continue;
    if (keywords.some((kw) => lower.includes(kw))) {
      return screenType;
    }
  }

  return 'unknown';
}
