import { SupportSubAgent } from './support-sub-agent.service';
import type { SupportBffPort } from '../../domain/ports/bff-ports';
import type { SupportTicket } from '../../domain/types/domain';

const mockTickets: SupportTicket[] = [
  { id: 'TK-1024', status: 'open', subject: 'Data issues', description: '', createdAt: '2026-03-30' },
];

const mockFaq = [
  { question: 'How do I check my data balance?', answer: 'Ask me!' },
];

const mockBff: SupportBffPort = {
  getTickets: jest.fn().mockResolvedValue(mockTickets),
  getFaq: jest.fn().mockResolvedValue(mockFaq),
  createTicket: jest.fn().mockResolvedValue({ id: 'TK-MOCK', status: 'open', subject: '', description: '', createdAt: '2026-03-30' }),
};

describe('SupportSubAgent', () => {
  let agent: SupportSubAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new SupportSubAgent(mockBff);
  });

  it('calls bff.getTickets with userId and bff.getFaq in parallel', async () => {
    await agent.handle('user-42');
    expect(mockBff.getTickets).toHaveBeenCalledWith('user-42');
    expect(mockBff.getFaq).toHaveBeenCalled();
  });

  it('returns support screenData with tickets and faqItems', async () => {
    const result = await agent.handle('user-42');
    expect(result.screenData).toEqual({
      type: 'support',
      tickets: mockTickets,
      faqItems: mockFaq,
    });
  });

  it('returns 3 processing steps all done', async () => {
    const result = await agent.handle('user-42');
    expect(result.processingSteps).toHaveLength(3);
    expect(result.processingSteps.every(s => s.status === 'done')).toBe(true);
  });
});
