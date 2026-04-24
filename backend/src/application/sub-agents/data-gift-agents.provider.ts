import type { DataGiftBffPort } from '../../domain/ports/bff-ports';
import { DataGiftSubAgent } from './data-gift-sub-agent.service';
import type { SubAgentRegistration } from './sub-agent-registration';

export function createDataGiftAgentRegistrations(bff: DataGiftBffPort): SubAgentRegistration[] {
  return [{ toolName: "share_data", agent: new DataGiftSubAgent(bff) }];
}
