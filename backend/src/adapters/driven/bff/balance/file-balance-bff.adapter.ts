import { Injectable } from '@nestjs/common';
import type { BalanceBffPort } from '../../../../domain/ports/bff-ports';
import type { Balance } from '../../../../domain/types/domain';
import { JsonDataStore } from '../../../../infrastructure/data/json-data-store';

const DEFAULT_BALANCE: Balance = {
  current: 0,
  currency: 'USD',
  lastTopUp: 'N/A',
  nextBillingDate: 'N/A',
};

@Injectable()
export class FileBalanceBffAdapter implements BalanceBffPort {
  constructor(private readonly store: JsonDataStore) {}

  async getBalance(userId: string): Promise<Balance> {
    return this.store.getBalance(userId) ?? DEFAULT_BALANCE;
  }

  async topUp(userId: string, amount: number): Promise<Balance> {
    return this.store.topUp(userId, amount);
  }
}
