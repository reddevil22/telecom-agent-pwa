import type { BundlesBffPort, PurchaseResult } from '../../../../domain/ports/bff-ports';
import type { Bundle } from '../../../../domain/types/domain';

export class MockBundlesBffAdapter implements BundlesBffPort {
  async getBundles(_userId: string): Promise<Bundle[]> {
    return [
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
    ];
  }

  async purchaseBundle(_userId: string, _bundleId: string): Promise<PurchaseResult> {
    return { success: false, message: 'Not implemented in mock', balance: { current: 0, currency: 'USD', lastTopUp: 'N/A', nextBillingDate: 'N/A' }, bundle: null };
  }
}
