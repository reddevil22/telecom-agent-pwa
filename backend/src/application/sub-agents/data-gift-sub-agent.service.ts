import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { ScreenData, ProcessingStep } from '../../domain/types/agent';
import type { DataGiftBffPort } from '../../domain/ports/bff-ports';

export interface SubAgentResult {
  screenData: ScreenData;
  processingSteps: ProcessingStep[];
}

export class DataGiftSubAgent implements SubAgentPort {
  constructor(private readonly bff: DataGiftBffPort) {}

  async handle(userId: string, args: Record<string, string>): Promise<SubAgentResult> {
    const recipient = await this.bff.resolveRecipient(userId, args.recipientQuery);
    if (!recipient) {
      return this.buildErrorScreen("Recipient not found. Please check the name or number.");
    }

    const amountMb = this.parseAmount(args.amount);
    if (amountMb <= 0) {
      return this.buildErrorScreen("Invalid amount. Please specify a value like '2 GB' or '500 MB'.");
    }

    const validation = await this.bff.validateAllowance(userId, amountMb);
    if (!validation.valid) {
      return this.buildErrorScreen(
        `Insufficient data allowance. You have ${this.formatMb(validation.availableMb)} available.`,
      );
    }

    try {
      const result = await this.bff.transferData(userId, recipient.userId, amountMb);

      return {
        screenData: {
          type: "dataGift",
          status: "success",
          title: "Data Shared Successfully",
          message: `${this.formatMb(result.amountMb)} has been sent to ${result.recipientName}.`,
          details: {
            recipientName: result.recipientName,
            recipientMsisdn: result.recipientMsisdn,
            amountMb: result.amountMb,
            sourceBundleName: result.sourceBundleName,
            remainingMb: result.remainingMb,
          },
        } as ScreenData,
        processingSteps: [
          { label: "Finding recipient", status: "done" as const },
          { label: "Checking your allowance", status: "done" as const },
          { label: "Transferring data", status: "done" as const },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transfer failed";
      return this.buildErrorScreen(message);
    }
  }

  private parseAmount(amount: string): number {
    const match = amount.match(/^(\d+(?:\.\d+)?)\s*(GB|MB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    return unit === "GB" ? Math.round(value * 1024) : Math.round(value);
  }

  private formatMb(mb: number): string {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  }

  private buildErrorScreen(message: string): SubAgentResult {
    return {
      screenData: {
        type: "dataGift",
        status: "error",
        title: "Unable to Share Data",
        message,
        details: {
          recipientName: "",
          recipientMsisdn: "",
          amountMb: 0,
          sourceBundleName: "",
          remainingMb: 0,
        },
      } as ScreenData,
      processingSteps: [{ label: "Validating request", status: "done" as const }],
    };
  }
}
