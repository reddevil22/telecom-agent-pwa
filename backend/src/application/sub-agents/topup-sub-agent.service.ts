import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { BalanceBffPort } from '../../domain/ports/bff-ports';
import type { ScreenData, ProcessingStep } from '../../domain/types/agent';

export class TopUpSubAgent implements SubAgentPort {
  constructor(private readonly balanceBff: BalanceBffPort) {}

  async handle(userId: string, params?: Record<string, string>): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }> {
    const amount = parseFloat(params?.['amount'] ?? '0');

    if (isNaN(amount) || amount <= 0) {
      return {
        screenData: {
          type: 'confirmation',
          title: 'Top-up Failed',
          status: 'error',
          message: 'Invalid amount. Please specify a positive number to top up.',
          details: {},
        },
        processingSteps: [
          { label: 'Validating amount', status: 'done' },
        ],
      };
    }

    const updated = await this.balanceBff.topUp(userId, amount);

    return {
      screenData: {
        type: 'confirmation',
        title: 'Top-up Successful!',
        status: 'success',
        message: `${updated.currency} ${amount.toFixed(2)} has been added to your balance.`,
        details: {
          amountAdded: `${updated.currency} ${amount.toFixed(2)}`,
          newBalance: `${updated.currency} ${updated.current.toFixed(2)}`,
        },
        updatedBalance: updated,
      },
      processingSteps: [
        { label: 'Validating amount', status: 'done' },
        { label: 'Processing top-up', status: 'done' },
        { label: 'Updating balance', status: 'done' },
      ],
    };
  }
}
