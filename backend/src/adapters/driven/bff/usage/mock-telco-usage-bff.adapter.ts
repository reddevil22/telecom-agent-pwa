import { Injectable } from '@nestjs/common';
import type { UsageBffPort } from '../../../../domain/ports/bff-ports';
import type { UsageEntry } from '../../../../domain/types/domain';
import { MockTelcoService } from '../../../../infrastructure/telco/mock-telco.service';

@Injectable()
export class MockTelcoUsageBffAdapter implements UsageBffPort {
  constructor(private readonly telco: MockTelcoService) {}

  async getUsage(userId: string): Promise<UsageEntry[]> {
    return this.telco.getUsage(userId);
  }
}
