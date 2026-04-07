import { Module } from '@nestjs/common';
import { SUPPORT_BFF_PORT } from '../../../../domain/tokens';
import { MockTelcoSupportBffAdapter } from './mock-telco-support-bff.adapter';
import { MockTelcoModule } from '../../../../infrastructure/telco/mock-telco.module';

@Module({
  imports: [MockTelcoModule],
  providers: [{ provide: SUPPORT_BFF_PORT, useClass: MockTelcoSupportBffAdapter }],
  exports: [SUPPORT_BFF_PORT],
})
export class SupportBffModule {}
