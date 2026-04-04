import { BundlesSubAgent } from './bundles-sub-agent.service';
import type { BundlesBffPort } from '../../domain/ports/bff-ports';
import type { Bundle } from '../../domain/types/domain';

const mockBundles: Bundle[] = [
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
];

const mockBff: BundlesBffPort = {
  getBundles: jest.fn().mockResolvedValue(mockBundles),
  purchaseBundle: jest.fn().mockResolvedValue({ success: false, message: 'Mock', balance: { current: 0, currency: 'USD', lastTopUp: 'N/A', nextBillingDate: 'N/A' }, bundle: null }),
};

describe('BundlesSubAgent', () => {
  let agent: BundlesSubAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new BundlesSubAgent(mockBff);
  });

  it('calls bff.getBundles with userId', async () => {
    await agent.handle('user-42');
    expect(mockBff.getBundles).toHaveBeenCalledWith('user-42');
  });

  it('returns bundles screenData', async () => {
    const result = await agent.handle('user-42');
    expect(result.screenData).toEqual({ type: 'bundles', bundles: mockBundles });
  });

  it('returns 3 processing steps all done', async () => {
    const result = await agent.handle('user-42');
    expect(result.processingSteps).toHaveLength(3);
    expect(result.processingSteps.every(s => s.status === 'done')).toBe(true);
  });
});
