import { Module } from '@nestjs/common';
import { BALANCE_BFF_PORT } from '../../../../domain/tokens';
import { MockTelcoBalanceBffAdapter } from './mock-telco-balance-bff.adapter';
import { MockTelcoModule } from '../../../../infrastructure/telco/mock-telco.module';

@Module({
  imports: [MockTelcoModule],
  providers: [{ provide: BALANCE_BFF_PORT, useClass: MockTelcoBalanceBffAdapter }],
  exports: [BALANCE_BFF_PORT],
})
export class BalanceBffModule {}
