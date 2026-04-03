import { Global, Module } from '@nestjs/common';
import { JsonDataStore } from './json-data-store';

@Global()
@Module({
  providers: [JsonDataStore],
  exports: [JsonDataStore],
})
export class JsonDataModule {}
