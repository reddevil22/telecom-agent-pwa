import { Module } from '@nestjs/common';
import { USAGE_BFF_PORT } from '../../../../domain/tokens';
import { MockTelcoUsageBffAdapter } from './mock-telco-usage-bff.adapter';
import { MockTelcoModule } from '../../../../infrastructure/telco/mock-telco.module';

@Module({
  imports: [MockTelcoModule],
  providers: [{ provide: USAGE_BFF_PORT, useClass: MockTelcoUsageBffAdapter }],
  exports: [USAGE_BFF_PORT],
})
export class UsageBffModule {}
