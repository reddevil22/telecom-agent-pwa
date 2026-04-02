import type { UsageBffPort } from '../../../../domain/ports/bff-ports';
import type { UsageEntry } from '../../../../domain/types/domain';

export class MockUsageBffAdapter implements UsageBffPort {
  async getUsage(_userId: string): Promise<UsageEntry[]> {
    return [
      { type: 'data', used: 3.7, total: 10, unit: 'GB', period: 'March 2026' },
      { type: 'voice', used: 142, total: 500, unit: 'min', period: 'March 2026' },
      { type: 'sms', used: 28, total: 200, unit: 'SMS', period: 'March 2026' },
    ];
  }
}
