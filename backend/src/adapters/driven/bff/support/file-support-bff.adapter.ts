import { Injectable } from '@nestjs/common';
import type { SupportBffPort } from '../../../../domain/ports/bff-ports';
import { JsonDataStore } from '../../../../infrastructure/data/json-data-store';

@Injectable()
export class FileSupportBffAdapter implements SupportBffPort {
  constructor(private readonly store: JsonDataStore) {}

  async getTickets(userId: string) {
    return this.store.getTickets(userId);
  }

  async getFaq() {
    return this.store.getFaq();
  }
}
