import type { SupportBffPort } from "../../domain/ports/bff-ports";
import type { SubAgentPort } from "../../domain/ports/sub-agent.port";
import { DualQuerySubAgent } from "./generic-sub-agents";
import { CreateTicketSubAgent } from "./create-ticket-sub-agent.service";
import { SupervisorService } from "../supervisor/supervisor.service";

export function registerSupportAgents(
  supervisor: SupervisorService,
  supportBff: SupportBffPort,
): void {
  supervisor.registerAgent(
    "get_support",
    new DualQuerySubAgent(
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
  );

  supervisor.registerAgent(
    "create_ticket",
    new CreateTicketSubAgent(supportBff),
  );
}
