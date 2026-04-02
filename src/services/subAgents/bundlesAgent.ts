import type { BundlesScreenData, ProcessingStep } from '../../types/agent';

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function bundlesAgent(): Promise<{ data: BundlesScreenData; steps: ProcessingStep[] }> {
  await delay(400);

  return {
    data: {
      type: 'bundles',
      bundles: [
        {
          id: 'b1',
          name: 'Starter Pack',
          description: 'Perfect for light users',
          price: 9.99,
          currency: 'USD',
          dataGB: 2,
          minutes: 100,
          sms: 50,
          validity: '30 days',
        },
        {
          id: 'b2',
          name: 'Value Plus',
          description: 'Great balance of data and minutes',
          price: 19.99,
          currency: 'USD',
          dataGB: 10,
          minutes: 500,
          sms: 200,
          validity: '30 days',
          popular: true,
        },
        {
          id: 'b3',
          name: 'Unlimited Pro',
          description: 'For power users who need it all',
          price: 39.99,
          currency: 'USD',
          dataGB: 50,
          minutes: -1,
          sms: -1,
          validity: '30 days',
        },
      ],
    },
    steps: [
      { label: 'Understanding your request', status: 'done' },
      { label: 'Retrieving available bundles', status: 'done' },
      { label: 'Preparing response', status: 'done' },
    ],
  };
}
