import { Module } from '@nestjs/common';
import { BUNDLES_BFF_PORT } from '../../../../domain/tokens';
import { MockTelcoBundlesBffAdapter } from './mock-telco-bundles-bff.adapter';
import { MockTelcoModule } from '../../../../infrastructure/telco/mock-telco.module';

@Module({
  imports: [MockTelcoModule],
  providers: [{ provide: BUNDLES_BFF_PORT, useClass: MockTelcoBundlesBffAdapter }],
  exports: [BUNDLES_BFF_PORT],
})
export class BundlesBffModule {}
