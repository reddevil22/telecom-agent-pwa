import type { BalanceBffPort } from "../../domain/ports/bff-ports";
import type { SubAgentPort } from "../../domain/ports/sub-agent.port";
import { ActionSubAgent, SimpleQuerySubAgent } from "./generic-sub-agents";
import { SupervisorService } from "../supervisor/supervisor.service";

export function registerBillingAgents(
  supervisor: SupervisorService,
  balanceBff: BalanceBffPort,
): void {
  supervisor.registerAgent(
    "check_balance",
    new SimpleQuerySubAgent((userId) => balanceBff.getBalance(userId), {
      screenType: "balance",
      processingLabels: { fetching: "Fetching account balance" },
      transformResult: (balance) => ({ balance }),
    }) as SubAgentPort,
  );

  supervisor.registerAgent(
    "top_up",
    new ActionSubAgent({
      screenType: "confirmation",
      validateParams: (params) => {
        const amount = parseFloat(params?.["amount"] ?? "0");
        if (isNaN(amount) || amount <= 0) {
          return {
            isValid: false,
            error:
              "Invalid amount. Please specify a positive number to top up.",
          };
        }
        return {
          isValid: true,
          extractedParams: { amount: amount.toString() },
        };
      },
      executeAction: async (userId, params) => {
        const amount = parseFloat(params.amount);
        const updated = await balanceBff.topUp(userId, amount);
        return {
          success: true,
          title: "Top-up Successful!",
          message: `${updated.currency} ${amount.toFixed(2)} has been added to your balance.`,
          details: {
            amountAdded: `${updated.currency} ${amount.toFixed(2)}`,
            newBalance: `${updated.currency} ${updated.current.toFixed(2)}`,
          },
          updatedBalance: updated,
        };
      },
      processingLabels: {
        validating: "Validating amount",
        processing: "Processing top-up",
        updating: "Updating balance",
      },
    }) as SubAgentPort,
  );
}
