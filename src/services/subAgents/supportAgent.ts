import type { SupportScreenData, ProcessingStep } from '../../types/agent';

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function supportAgent(): Promise<{ data: SupportScreenData; steps: ProcessingStep[] }> {
  await delay(500);

  return {
    data: {
      type: 'support',
      tickets: [
        {
          id: 'TK-1024',
          status: 'open',
          subject: 'Data connectivity issues in downtown area',
          createdAt: '2026-03-30',
        },
        {
          id: 'TK-1019',
          status: 'in_progress',
          subject: 'Incorrect billing amount on last invoice',
          createdAt: '2026-03-25',
        },
      ],
      faqItems: [
        {
          question: 'How do I check my data balance?',
          answer: 'You can ask me anytime! Just type "check my usage" or "show my balance".',
        },
        {
          question: 'How do I activate a new bundle?',
          answer: 'Browse available bundles by asking "what bundles are available?" and select one to activate.',
        },
        {
          question: 'How do I contact a live agent?',
          answer: 'Say "connect me to an agent" and we\'ll route you to the next available representative.',
        },
      ],
    },
    steps: [
      { label: 'Understanding your request', status: 'done' },
      { label: 'Loading support options', status: 'done' },
      { label: 'Preparing response', status: 'done' },
    ],
  };
}
