import { SimpleQuerySubAgent } from './generic-sub-agents';
import type { AccountProfile, ActiveSubscription, TransactionEntry, OpenTicket } from '../../domain/types/domain';

const mockSummary: {
  profile: AccountProfile;
  activeSubscriptions: ActiveSubscription[];
  recentTransactions: TransactionEntry[];
  openTickets: OpenTicket[];
} = {
  profile: {
    name: 'Test User',
    msisdn: '+1234567890',
    plan: 'Test Plan',
    status: 'active',
    balance: { current: 25.00, currency: 'USD', lastTopUp: '2026-03-01', nextBillingDate: '2026-04-30' },
    billingCycleStart: '2026-04-01',
    billingCycleEnd: '2026-04-30',
  },
  activeSubscriptions: [],
  recentTransactions: [],
  openTickets: [],
};

const agent = new SimpleQuerySubAgent(
  () => Promise.resolve(mockSummary),
  {
    screenType: 'account',
    processingLabels: { fetching: 'Loading account' },
    transformResult: (summary) => summary as Record<string, unknown>,
  },
);

describe('AccountSubAgent (via SimpleQuerySubAgent)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns screenType account', async () => {
    const result = await agent.handle('user-1');
    expect(result.screenData.type).toBe('account');
  });

  it('returns account data shape', async () => {
    const result = await agent.handle('user-1');
    const data = result.screenData as unknown as Record<string, unknown>;
    expect(data).toHaveProperty('profile');
    expect(data).toHaveProperty('activeSubscriptions');
    expect(data).toHaveProperty('recentTransactions');
    expect(data).toHaveProperty('openTickets');
  });

  it('returns 3 processing steps all done', async () => {
    const result = await agent.handle('user-1');
    expect(result.processingSteps).toHaveLength(3);
    expect(result.processingSteps.every(s => s.status === 'done')).toBe(true);
  });
});
