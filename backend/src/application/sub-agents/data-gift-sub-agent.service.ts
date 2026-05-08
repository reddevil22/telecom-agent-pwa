import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import type { ScreenData, ProcessingStep } from '../../domain/types/agent';
import type { DataGiftBffPort } from '../../domain/ports/bff-ports';
import { DataGiftArgsParser } from './data-gift-args-parser';

export interface SubAgentResult {
  screenData: ScreenData;
  processingSteps: ProcessingStep[];
}

export class DataGiftSubAgent implements SubAgentPort {
  constructor(private readonly bff: DataGiftBffPort) {}

  async handle(userId: string, _sessionId: string, args?: Record<string, string>): Promise<SubAgentResult> {
    const recipient = await this.bff.resolveRecipient(userId, args?.recipientQuery ?? '');
    if (!recipient) {
      return this.buildErrorScreen("Recipient not found. Please check the name or number.");
    }

    const amountMb = DataGiftArgsParser.parseAmount(args?.amount ?? '');
    if (amountMb <= 0) {
      return this.buildErrorScreen("Invalid amount. Please specify a value like '2 GB' or '500 MB'.");
    }

    const validation = await this.bff.validateAllowance(userId, amountMb);
    if (!validation.valid) {
      return this.buildErrorScreen(
        `Insufficient data allowance. You have ${DataGiftArgsParser.formatMb(validation.availableMb)} available.`,
      );
    }

    try {
      const result = await this.bff.transferData(userId, recipient.userId, amountMb);

      return {
        screenData: {
          type: "dataGift",
          status: "success",
          title: "Data Shared Successfully",
          message: `${DataGiftArgsParser.formatMb(result.amountMb)} has been sent to ${result.recipientName}.`,
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