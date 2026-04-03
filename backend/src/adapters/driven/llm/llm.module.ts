import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { LLM_PORT } from '../../../domain/tokens';
import { OpenAiCompatibleLlmAdapter } from './openai-compatible.adapter';

@Module({
  providers: [
    {
      provide: LLM_PORT,
      useFactory: (config: ConfigService, logger: PinoLogger) => {
        const baseUrl = config.get<string>('LLM_BASE_URL')!;
        const apiKey = config.get<string>('LLM_API_KEY') ?? '';
        return new OpenAiCompatibleLlmAdapter(baseUrl, apiKey, logger);
      },
      inject: [ConfigService, PinoLogger],
    },
  ],
  exports: [LLM_PORT],
})
export class LlmModule {}
