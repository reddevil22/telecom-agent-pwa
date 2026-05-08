import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { BundlesBffPort, BalanceBffPort } from '../../domain/ports/bff-ports';
import type { ScreenData, ProcessingStep } from '../../domain/types/agent';

export class ViewBundleDetailsSubAgent implements SubAgentPort {
  constructor(
    private readonly bundlesBff: BundlesBffPort,
    private readonly balanceBff: BalanceBffPort,
  ) {}

  async handle(userId: string, _sessionId: string, params?: Record<string, string>): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }> {
    const bundleId = params?.['bundleId'] ?? '';

    if (!bundleId) {
      return {
        screenData: {
          type: 'unknown',
        },
        processingSteps: [
          { label: 'Validating bundle ID', status: 'done' },
        ],
      };
    }

    const bundles = await this.bundlesBff.getBundles(userId);
    const bundle = bundles.find(b => b.id === bundleId);

    if (!bundle) {
      return {
        screenData: {
          type: 'unknown',
        },
        processingSteps: [
          { label: 'Finding bundle', status: 'done' },
        ],
      };
    }

    const currentBalance = await this.balanceBff.getBalance(userId);

    return {
      screenData: {
        type: 'bundleDetail',
        bundle,
        currentBalance,
      },
      processingSteps: [
        { label: 'Finding bundle', status: 'done' },
        { label: 'Retrieving balance', status: 'done' },
        { label: 'Preparing details', status: 'done' },
      ],
    };
  }
}