import { Module } from '@nestjs/common';
import { BALANCE_BFF_PORT } from '../../../../domain/tokens';
import { FileBalanceBffAdapter } from './file-balance-bff.adapter';

@Module({
  providers: [{ provide: BALANCE_BFF_PORT, useClass: FileBalanceBffAdapter }],
  exports: [BALANCE_BFF_PORT],
})
export class BalanceBffModule {}
