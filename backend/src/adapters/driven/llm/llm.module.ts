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
        const provider = config.get<string>('LLM_PROVIDER') ?? 'local';
        const timeoutMs = config.get<number>('LLM_TIMEOUT_MS') ?? 30_000;

        if (provider === 'dashscope') {
          const baseUrl = config.get<string>('DASHSCOPE_BASE_URL')!;
          const apiKey = config.get<string>('DASHSCOPE_API_KEY')!;
          return new OpenAiCompatibleLlmAdapter(baseUrl, apiKey, logger, timeoutMs);
        }

        // Default: local llama-server
        const baseUrl = config.get<string>('LLM_BASE_URL')!;
        const apiKey = config.get<string>('LLM_API_KEY') ?? '';
        return new OpenAiCompatibleLlmAdapter(baseUrl, apiKey, logger, timeoutMs);
      },
      inject: [ConfigService, PinoLogger],
    },
  ],
  exports: [LLM_PORT],
})
export class LlmModule {}
