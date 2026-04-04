import type { BalanceBffPort } from '../../../../domain/ports/bff-ports';
import type { Balance } from '../../../../domain/types/domain';

export class MockBalanceBffAdapter implements BalanceBffPort {
  async getBalance(_userId: string): Promise<Balance> {
    return {
      current: 42.5,
      currency: 'USD',
      lastTopUp: '2026-03-28',
      nextBillingDate: '2026-04-15',
    };
  }

  async topUp(_userId: string, _amount: number): Promise<Balance> {
    return {
      current: 42.5,
      currency: 'USD',
      lastTopUp: '2026-03-28',
      nextBillingDate: '2026-04-15',
    };
  }
}
