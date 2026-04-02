import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { UsageBffPort } from '../../domain/ports/bff-ports';
import type { ScreenData, ProcessingStep } from '../../domain/types/agent';

export class UsageSubAgent implements SubAgentPort {
  constructor(private readonly bff: UsageBffPort) {}

  async handle(userId: string): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }> {
    const usage = await this.bff.getUsage(userId);
    return {
      screenData: { type: 'usage', usage },
      processingSteps: [
        { label: 'Understanding your request', status: 'done' },
        { label: 'Fetching usage data', status: 'done' },
        { label: 'Preparing response', status: 'done' },
      ],
    };
  }
}
