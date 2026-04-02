import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { SupportBffPort } from '../../domain/ports/bff-ports';
import type { ScreenData, ProcessingStep } from '../../domain/types/agent';

export class SupportSubAgent implements SubAgentPort {
  constructor(private readonly bff: SupportBffPort) {}

  async handle(userId: string): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }> {
    const [tickets, faqItems] = await Promise.all([
      this.bff.getTickets(userId),
      this.bff.getFaq(),
    ]);
    return {
      screenData: { type: 'support', tickets, faqItems },
      processingSteps: [
        { label: 'Understanding your request', status: 'done' },
        { label: 'Loading support options', status: 'done' },
        { label: 'Preparing response', status: 'done' },
      ],
    };
  }
}
