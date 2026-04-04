import { Global, Module } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { JsonDataStore } from './json-data-store';
import { LOGGER } from '../../domain/tokens';

@Global()
@Module({
  providers: [
    {
      provide: LOGGER,
      useExisting: PinoLogger,
    },
    JsonDataStore,
  ],
  exports: [JsonDataStore],
})
export class JsonDataModule {}
