import type { SubAgentPort } from "../../domain/ports/sub-agent.port";

export interface SubAgentRegistration {
  toolName: string;
  agent: SubAgentPort;
}
