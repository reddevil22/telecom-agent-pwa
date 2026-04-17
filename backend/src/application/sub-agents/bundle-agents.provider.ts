import type {
  BalanceBffPort,
  BundlesBffPort,
} from "../../domain/ports/bff-ports";
import type { SubAgentPort } from "../../domain/ports/sub-agent.port";
import { SimpleQuerySubAgent } from "./generic-sub-agents";
import { PurchaseBundleSubAgent } from "./purchase-bundle-sub-agent.service";
import { ViewBundleDetailsSubAgent } from "./view-bundle-details-sub-agent.service";
import { SupervisorService } from "../supervisor/supervisor.service";
import type { SubAgentRegistration } from "./sub-agent-registration";

export function createBundleAgentRegistrations(
  bundlesBff: BundlesBffPort,
  balanceBff: BalanceBffPort,
): SubAgentRegistration[] {
  return [
    {
      toolName: "list_bundles",
      agent: new SimpleQuerySubAgent((userId) => bundlesBff.getBundles(userId), {
        screenType: "bundles",
        processingLabels: { fetching: "Retrieving available bundles" },
        transformResult: (bundles) => ({ bundles }),
      }) as SubAgentPort,
    },
    {
      toolName: "view_bundle_details",
      agent: new ViewBundleDetailsSubAgent(bundlesBff, balanceBff),
    },
    {
      toolName: "purchase_bundle",
      agent: new PurchaseBundleSubAgent(bundlesBff),
    },
  ];
}

export function registerBundleAgents(
  supervisor: SupervisorService,
  bundlesBff: BundlesBffPort,
  balanceBff: BalanceBffPort,
): void {
  for (const registration of createBundleAgentRegistrations(
    bundlesBff,
    balanceBff,
  )) {
    supervisor.registerAgent(registration.toolName, registration.agent);
  }
}
