export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  syntheticPrompt: string;
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    id: 'balance',
    label: 'Balance',
    icon: '💰',
    syntheticPrompt: 'Show my balance',
  },
  {
    id: 'bundles',
    label: 'Bundles',
    icon: '📦',
    syntheticPrompt: 'What bundles are available?',
  },
  {
    id: 'usage',
    label: 'Usage',
    icon: '📊',
    syntheticPrompt: 'Check my usage',
  },
  {
    id: 'support',
    label: 'Support',
    icon: '🎧',
    syntheticPrompt: 'I need support',
  },
  {
    id: 'account',
    label: 'Account',
    icon: '👤',
    syntheticPrompt: 'Show my account',
  },
];
