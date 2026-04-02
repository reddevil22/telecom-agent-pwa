import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { BalanceBffPort } from '../../domain/ports/bff-ports';
import type { ScreenData, ProcessingStep } from '../../domain/types/agent';

export class BalanceSubAgent implements SubAgentPort {
  constructor(private readonly bff: BalanceBffPort) {}

  async handle(userId: string): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }> {
    const balance = await this.bff.getBalance(userId);
    return {
      screenData: { type: 'balance', balance },
      processingSteps: [
        { label: 'Understanding your request', status: 'done' },
        { label: 'Fetching account balance', status: 'done' },
        { label: 'Preparing response', status: 'done' },
      ],
    };
  }
}
