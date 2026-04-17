import type { UsageBffPort } from "../../domain/ports/bff-ports";
import type { SubAgentPort } from "../../domain/ports/sub-agent.port";
import { SimpleQuerySubAgent } from "./generic-sub-agents";
import { SupervisorService } from "../supervisor/supervisor.service";
import { MockTelcoService } from "../../infrastructure/telco/mock-telco.service";

export function registerAccountAgents(
  supervisor: SupervisorService,
  usageBff: UsageBffPort,
  telcoService: MockTelcoService,
): void {
  supervisor.registerAgent(
    "check_usage",
    new SimpleQuerySubAgent((userId) => usageBff.getUsage(userId), {
      screenType: "usage",
      processingLabels: { fetching: "Fetching usage data" },
      transformResult: (usage) => ({ usage }),
    }) as SubAgentPort,
  );

  supervisor.registerAgent(
    "get_account_summary",
    new SimpleQuerySubAgent(
      (userId) => Promise.resolve(telcoService.getAccountSummary(userId)),
      {
        screenType: "account",
        processingLabels: { fetching: "Loading account overview" },
        transformResult: (summary) => summary as Record<string, unknown>,
      },
    ) as SubAgentPort,
  );
}
