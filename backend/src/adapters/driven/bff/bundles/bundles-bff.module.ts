import { Module } from '@nestjs/common';
import { BUNDLES_BFF_PORT } from '../../../../domain/tokens';
import { FileBundlesBffAdapter } from './file-bundles-bff.adapter';

@Module({
  providers: [{ provide: BUNDLES_BFF_PORT, useClass: FileBundlesBffAdapter }],
  exports: [BUNDLES_BFF_PORT],
})
export class BundlesBffModule {}
