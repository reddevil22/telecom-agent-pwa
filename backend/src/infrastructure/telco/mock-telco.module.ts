import { Module } from '@nestjs/common';
import { MockTelcoService } from './mock-telco.service';
import { SqliteDataModule } from '../data/sqlite-data.module';

@Module({
  imports: [SqliteDataModule],
  providers: [MockTelcoService],
  exports: [MockTelcoService],
})
export class MockTelcoModule {}
