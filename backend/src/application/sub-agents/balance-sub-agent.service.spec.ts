import { BalanceSubAgent } from './balance-sub-agent.service';
import type { BalanceBffPort } from '../../domain/ports/bff-ports';
import type { Balance } from '../../domain/types/domain';

const mockBalance: Balance = {
  current: 42.5,
  currency: 'USD',
  lastTopUp: '2026-03-28',
  nextBillingDate: '2026-04-15',
};

const mockBff: BalanceBffPort = {
  getBalance: jest.fn().mockResolvedValue(mockBalance),
  topUp: jest.fn().mockResolvedValue(mockBalance),
};

describe('BalanceSubAgent', () => {
  let agent: BalanceSubAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new BalanceSubAgent(mockBff);
  });

  it('calls bff.getBalance with userId', async () => {
    await agent.handle('user-42');
    expect(mockBff.getBalance).toHaveBeenCalledWith('user-42');
  });

  it('returns balance screenData', async () => {
    const result = await agent.handle('user-42');
    expect(result.screenData).toEqual({ type: 'balance', balance: mockBalance });
  });

  it('returns 3 processing steps all done', async () => {
    const result = await agent.handle('user-42');
    expect(result.processingSteps).toHaveLength(3);
    expect(result.processingSteps.every(s => s.status === 'done')).toBe(true);
  });
});
