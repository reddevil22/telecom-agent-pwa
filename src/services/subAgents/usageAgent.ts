import type { UsageScreenData, ProcessingStep } from '../../types/agent';

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function usageAgent(): Promise<{ data: UsageScreenData; steps: ProcessingStep[] }> {
  await delay(350);

  return {
    data: {
      type: 'usage',
      usage: [
        { type: 'data', used: 3.7, total: 10, unit: 'GB', period: 'March 2026' },
        { type: 'voice', used: 142, total: 500, unit: 'min', period: 'March 2026' },
        { type: 'sms', used: 28, total: 200, unit: 'SMS', period: 'March 2026' },
      ],
    },
    steps: [
      { label: 'Understanding your request', status: 'done' },
      { label: 'Fetching usage data', status: 'done' },
      { label: 'Preparing response', status: 'done' },
    ],
  };
}
