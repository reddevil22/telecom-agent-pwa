import type { UsageBffPort } from "../../domain/ports/bff-ports";
import type { SubAgentPort } from "../../domain/ports/sub-agent.port";
import { SimpleQuerySubAgent } from "./generic-sub-agents";
import { SupervisorService } from "../supervisor/supervisor.service";
import { MockTelcoService } from "../../infrastructure/telco/mock-telco.service";
import type { SubAgentRegistration } from "./sub-agent-registration";

export function createAccountAgentRegistrations(
  usageBff: UsageBffPort,
  telcoService: MockTelcoService,
): SubAgentRegistration[] {
  return [
    {
      toolName: "check_usage",
      agent: new SimpleQuerySubAgent((userId) => usageBff.getUsage(userId), {
        screenType: "usage",
        processingLabels: { fetching: "Fetching usage data" },
        transformResult: (usage) => ({ usage }),
      }) as SubAgentPort,
    },
    {
      toolName: "get_account_summary",
      agent: new SimpleQuerySubAgent(
        (userId) => Promise.resolve(telcoService.getAccountSummary(userId)),
        {
          screenType: "account",
          processingLabels: { fetching: "Loading account overview" },
          transformResult: (summary) => summary as Record<string, unknown>,
        },
      ) as SubAgentPort,
    },
  ];
}

export function registerAccountAgents(
  supervisor: SupervisorService,
  usageBff: UsageBffPort,
  telcoService: MockTelcoService,
): void {
  for (const registration of createAccountAgentRegistrations(
    usageBff,
    telcoService,
  )) {
    supervisor.registerAgent(registration.toolName, registration.agent);
  }
}
