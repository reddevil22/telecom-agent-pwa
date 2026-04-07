import { Injectable } from '@nestjs/common';
import type { BalanceBffPort } from '../../../../domain/ports/bff-ports';
import type { Balance } from '../../../../domain/types/domain';
import { MockTelcoService } from '../../../../infrastructure/telco/mock-telco.service';

@Injectable()
export class MockTelcoBalanceBffAdapter implements BalanceBffPort {
  constructor(private readonly telco: MockTelcoService) {}

  async getBalance(userId: string): Promise<Balance> {
    return this.telco.getBalance(userId);
  }

  async topUp(userId: string, amount: number): Promise<Balance> {
    return this.telco.topUp(userId, amount);
  }
}
