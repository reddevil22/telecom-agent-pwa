import type { BalanceScreenData, ProcessingStep } from '../../types/agent';

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function balanceAgent(): Promise<{ data: BalanceScreenData; steps: ProcessingStep[] }> {
  await delay(300);

  return {
    data: {
      type: 'balance',
      balance: {
        current: 42.5,
        currency: 'USD',
        lastTopUp: '2026-03-28',
        nextBillingDate: '2026-04-15',
      },
    },
    steps: [
      { label: 'Understanding your request', status: 'done' },
      { label: 'Fetching account balance', status: 'done' },
      { label: 'Preparing response', status: 'done' },
    ],
  };
}
