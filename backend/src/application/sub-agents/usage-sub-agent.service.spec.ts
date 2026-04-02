import { UsageSubAgent } from './usage-sub-agent.service';
import type { UsageBffPort } from '../../domain/ports/bff-ports';
import type { UsageEntry } from '../../domain/types/domain';

const mockUsage: UsageEntry[] = [
  { type: 'data', used: 3.7, total: 10, unit: 'GB', period: 'March 2026' },
  { type: 'voice', used: 142, total: 500, unit: 'min', period: 'March 2026' },
  { type: 'sms', used: 28, total: 200, unit: 'SMS', period: 'March 2026' },
];

const mockBff: UsageBffPort = {
  getUsage: jest.fn().mockResolvedValue(mockUsage),
};

describe('UsageSubAgent', () => {
  let agent: UsageSubAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new UsageSubAgent(mockBff);
  });

  it('calls bff.getUsage with userId', async () => {
    await agent.handle('user-42');
    expect(mockBff.getUsage).toHaveBeenCalledWith('user-42');
  });

  it('returns usage screenData', async () => {
    const result = await agent.handle('user-42');
    expect(result.screenData).toEqual({ type: 'usage', usage: mockUsage });
  });

  it('returns 3 processing steps all done', async () => {
    const result = await agent.handle('user-42');
    expect(result.processingSteps).toHaveLength(3);
    expect(result.processingSteps.every(s => s.status === 'done')).toBe(true);
  });
});
