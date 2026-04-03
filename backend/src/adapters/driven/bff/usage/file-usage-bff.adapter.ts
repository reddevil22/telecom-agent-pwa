import { Injectable } from '@nestjs/common';
import type { UsageBffPort } from '../../../../domain/ports/bff-ports';
import type { UsageEntry } from '../../../../domain/types/domain';
import { JsonDataStore } from '../../../../infrastructure/data/json-data-store';

@Injectable()
export class FileUsageBffAdapter implements UsageBffPort {
  constructor(private readonly store: JsonDataStore) {}

  async getUsage(userId: string): Promise<UsageEntry[]> {
    return this.store.getUsage(userId);
  }
}
