import { Module } from '@nestjs/common';
import { USAGE_BFF_PORT } from '../../../../domain/tokens';
import { FileUsageBffAdapter } from './file-usage-bff.adapter';

@Module({
  providers: [{ provide: USAGE_BFF_PORT, useClass: FileUsageBffAdapter }],
  exports: [USAGE_BFF_PORT],
})
export class UsageBffModule {}
