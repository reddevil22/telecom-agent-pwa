import { Module } from '@nestjs/common';
import { SUPPORT_BFF_PORT } from '../../../../domain/tokens';
import { MockSupportBffAdapter } from './mock-support-bff.adapter';

@Module({
  providers: [{ provide: SUPPORT_BFF_PORT, useClass: MockSupportBffAdapter }],
  exports: [SUPPORT_BFF_PORT],
})
export class SupportBffModule {}
