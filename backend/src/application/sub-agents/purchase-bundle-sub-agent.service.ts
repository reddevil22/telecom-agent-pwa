import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { BundlesBffPort } from '../../domain/ports/bff-ports';
import type { ScreenData, ProcessingStep } from '../../domain/types/agent';

export class PurchaseBundleSubAgent implements SubAgentPort {
  constructor(private readonly bundlesBff: BundlesBffPort) {}

  async handle(userId: string, _sessionId: string, params?: Record<string, string>): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }> {
    const bundleId = params?.['bundleId'] ?? '';

    if (!bundleId) {
      return {
        screenData: {
          type: 'confirmation',
          title: 'Purchase Failed',
          status: 'error',
          message: 'No bundle specified. Please select a bundle to purchase.',
          details: {},
        },
        processingSteps: [
          { label: 'Validating bundle', status: 'done' },
        ],
      };
    }

    const result = await this.bundlesBff.purchaseBundle(userId, bundleId);

    return {
      screenData: {
        type: 'confirmation',
        title: result.success ? 'Bundle Purchased!' : 'Purchase Failed',
        status: result.success ? 'success' : 'error',
        message: result.message,
        details: {
          ...(result.bundle ? { bundleName: result.bundle.name, price: `${result.bundle.currency} ${result.bundle.price}` } : {}),
          newBalance: `${result.balance.currency} ${result.balance.current.toFixed(2)}`,
        },
        updatedBalance: result.balance,
      },
      processingSteps: [
        { label: 'Validating bundle', status: 'done' },
        { label: 'Checking balance', status: 'done' },
        { label: 'Processing purchase', status: 'done' },
      ],
    };
  }
}