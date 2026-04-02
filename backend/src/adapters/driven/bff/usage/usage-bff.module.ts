import { Module } from '@nestjs/common';
import { USAGE_BFF_PORT } from '../../../../domain/tokens';
import { MockUsageBffAdapter } from './mock-usage-bff.adapter';

@Module({
  providers: [{ provide: USAGE_BFF_PORT, useClass: MockUsageBffAdapter }],
  exports: [USAGE_BFF_PORT],
})
export class UsageBffModule {}
