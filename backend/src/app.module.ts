import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from './config/config.module';
import { AgentModule } from './app.agent-module';
import { LoggerModule } from './infrastructure/logging/pino-logger.module';
import { SqliteDataModule } from './infrastructure/data/sqlite-data.module';
import { LlmHealthModule } from './infrastructure/llm/llm-health.module';
import { HistoryController } from './adapters/driving/rest/history.controller';
import { LlmHealthController } from './adapters/driving/rest/llm-health.controller';
import { LoggingInterceptor } from './infrastructure/interceptors/logging.interceptor';
import { AllExceptionsFilter } from './infrastructure/filters/all-exceptions.filter';

@Module({
  imports: [LoggerModule, ConfigModule, SqliteDataModule, AgentModule, LlmHealthModule],
  controllers: [HistoryController, LlmHealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
