import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AgentModule } from './app.agent-module';
import { LoggerModule } from './infrastructure/logging/pino-logger.module';
import { SqliteDataModule } from './infrastructure/data/sqlite-data.module';
import { JsonDataModule } from './infrastructure/data/json-data.module';
import { LlmHealthModule } from './infrastructure/llm/llm-health.module';
import { HistoryController } from './adapters/driving/rest/history.controller';
import { LlmHealthController } from './adapters/driving/rest/llm-health.controller';
import { CorrelationIdMiddleware } from './infrastructure/middleware/correlation-id.middleware';
import { LoggingInterceptor } from './infrastructure/interceptors/logging.interceptor';
import { AllExceptionsFilter } from './infrastructure/filters/all-exceptions.filter';

@Module({
  imports: [LoggerModule, ConfigModule, SqliteDataModule, JsonDataModule, AgentModule, LlmHealthModule],
  controllers: [HistoryController, LlmHealthController],
  providers: [LoggingInterceptor, AllExceptionsFilter],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('agent/chat');
  }
}
