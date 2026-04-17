import type { SupportBffPort } from "../../domain/ports/bff-ports";
import type { SubAgentPort } from "../../domain/ports/sub-agent.port";
import { DualQuerySubAgent } from "./generic-sub-agents";
import { CreateTicketSubAgent } from "./create-ticket-sub-agent.service";
import { SupervisorService } from "../supervisor/supervisor.service";
import type { SubAgentRegistration } from "./sub-agent-registration";

export function createSupportAgentRegistrations(
  supportBff: SupportBffPort,
): SubAgentRegistration[] {
  return [
    {
      toolName: "get_support",
      agent: new DualQuerySubAgent(
        (userId) => supportBff.getTickets(userId),
        () => supportBff.getFaq(),
        {
          screenType: "support",
          processingLabels: {
            primary: "Loading support options",
            secondary: "Loading FAQ",
          },
          transformResult: (tickets, faqItems) => ({ tickets, faqItems }),
        },
      ) as SubAgentPort,
    },
    {
      toolName: "create_ticket",
      agent: new CreateTicketSubAgent(supportBff),
    },
  ];
}

export function registerSupportAgents(
  supervisor: SupervisorService,
  supportBff: SupportBffPort,
): void {
  for (const registration of createSupportAgentRegistrations(supportBff)) {
    supervisor.registerAgent(registration.toolName, registration.agent);
  }
}
