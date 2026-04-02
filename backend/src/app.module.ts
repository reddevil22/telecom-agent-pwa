import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { AgentModule } from './app.agent-module';

@Module({
  imports: [ConfigModule, AgentModule],
})
export class AppModule {}
