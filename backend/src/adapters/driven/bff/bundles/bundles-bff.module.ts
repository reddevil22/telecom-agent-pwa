import { Module } from '@nestjs/common';
import { BUNDLES_BFF_PORT } from '../../../../domain/tokens';
import { MockBundlesBffAdapter } from './mock-bundles-bff.adapter';

@Module({
  providers: [{ provide: BUNDLES_BFF_PORT, useClass: MockBundlesBffAdapter }],
  exports: [BUNDLES_BFF_PORT],
})
export class BundlesBffModule {}
