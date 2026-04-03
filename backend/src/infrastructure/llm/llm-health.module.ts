import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmHealthService } from './llm-health.service';

@Module({
  providers: [
    {
      provide: LlmHealthService,
      useFactory: (config: ConfigService) => {
        return new LlmHealthService(
          config.get<string>('LLM_BASE_URL')!,
          config.get<string>('LLM_API_KEY')!,
        );
      },
      inject: [ConfigService],
    },
  ],
  exports: [LlmHealthService],
})
export class LlmHealthModule {}
