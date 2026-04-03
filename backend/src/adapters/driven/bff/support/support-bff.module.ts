import { Module } from '@nestjs/common';
import { SUPPORT_BFF_PORT } from '../../../../domain/tokens';
import { FileSupportBffAdapter } from './file-support-bff.adapter';

@Module({
  providers: [{ provide: SUPPORT_BFF_PORT, useClass: FileSupportBffAdapter }],
  exports: [SUPPORT_BFF_PORT],
})
export class SupportBffModule {}
