import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PORT } from '../../../domain/tokens';
import { OpenAiCompatibleLlmAdapter } from './openai-compatible.adapter';

@Module({
  providers: [
    {
      provide: LLM_PORT,
      useFactory: (config: ConfigService) => {
        const baseUrl = config.get<string>('LLM_BASE_URL')!;
        const apiKey = config.get<string>('LLM_API_KEY') ?? '';
        return new OpenAiCompatibleLlmAdapter(baseUrl, apiKey);
      },
      inject: [ConfigService],
    },
  ],
  exports: [LLM_PORT],
})
export class LlmModule {}
