import { Module } from '@nestjs/common';
import { BALANCE_BFF_PORT } from '../../../../domain/tokens';
import { MockBalanceBffAdapter } from './mock-balance-bff.adapter';

@Module({
  providers: [{ provide: BALANCE_BFF_PORT, useClass: MockBalanceBffAdapter }],
  exports: [BALANCE_BFF_PORT],
})
export class BalanceBffModule {}
