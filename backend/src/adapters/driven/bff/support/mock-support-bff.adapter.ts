import type { SupportBffPort } from '../../../../domain/ports/bff-ports';
import type { SupportTicket } from '../../../../domain/types/domain';

export class MockSupportBffAdapter implements SupportBffPort {
  async getTickets(_userId: string): Promise<SupportTicket[]> {
    return [
      {
        id: 'TK-1024',
        status: 'open',
        subject: 'Data connectivity issues in downtown area',
        description: '',
        createdAt: '2026-03-30',
      },
      {
        id: 'TK-1019',
        status: 'in_progress',
        subject: 'Incorrect billing amount on last invoice',
        description: '',
        createdAt: '2026-03-25',
      },
    ];
  }

  async getFaq(): Promise<Array<{ question: string; answer: string }>> {
    return [
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
        answer: "Say \"connect me to an agent\" and we'll route you to the next available representative.",
      },
    ];
  }

  async createTicket(_userId: string, subject: string, description: string): Promise<SupportTicket> {
    return {
      id: 'TK-MOCK',
      status: 'open',
      subject,
      description,
      createdAt: new Date().toISOString().split('T')[0],
    };
  }
}
