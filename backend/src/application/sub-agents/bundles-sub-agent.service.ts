import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { BundlesBffPort } from '../../domain/ports/bff-ports';
import type { ScreenData, ProcessingStep } from '../../domain/types/agent';

export class BundlesSubAgent implements SubAgentPort {
  constructor(private readonly bff: BundlesBffPort) {}

  async handle(userId: string): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }> {
    const bundles = await this.bff.getBundles(userId);
    return {
      screenData: { type: 'bundles', bundles },
      processingSteps: [
        { label: 'Understanding your request', status: 'done' },
        { label: 'Retrieving available bundles', status: 'done' },
        { label: 'Preparing response', status: 'done' },
      ],
    };
  }
}
