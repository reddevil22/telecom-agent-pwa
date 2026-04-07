import { Module } from '@nestjs/common';
import { SqliteConnectionService } from './sqlite-connection.service';
import { SqliteConversationDataMapper } from './conversation-data.mapper';
import { CONVERSATION_STORAGE_PORT } from '../../domain/tokens';

@Module({
  providers: [
    SqliteConnectionService,
    {
      provide: CONVERSATION_STORAGE_PORT,
      useClass: SqliteConversationDataMapper,
    },
  ],
  exports: [CONVERSATION_STORAGE_PORT, SqliteConnectionService],
})
export class SqliteDataModule {}
