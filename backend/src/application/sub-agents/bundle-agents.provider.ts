import type { BalanceBffPort, BundlesBffPort } from '../../domain/ports/bff-ports';
import type { SubAgentPort } from '../../domain/ports/sub-agent.port';
import { SimpleQuerySubAgent } from './generic-sub-agents';
import { PurchaseBundleSubAgent } from './purchase-bundle-sub-agent.service';
import { ViewBundleDetailsSubAgent } from './view-bundle-details-sub-agent.service';
import { SupervisorService } from '../supervisor/supervisor.service';

export function registerBundleAgents(
  supervisor: SupervisorService,
  bundlesBff: BundlesBffPort,
  balanceBff: BalanceBffPort,
): void {
  supervisor.registerAgent('list_bundles', new SimpleQuerySubAgent(
    (userId) => bundlesBff.getBundles(userId),
    {
      screenType: 'bundles',
      processingLabels: { fetching: 'Retrieving available bundles' },
      transformResult: (bundles) => ({ bundles }),
    },
  ) as SubAgentPort);

  supervisor.registerAgent('view_bundle_details', new ViewBundleDetailsSubAgent(bundlesBff, balanceBff));
  supervisor.registerAgent('purchase_bundle', new PurchaseBundleSubAgent(bundlesBff));
}
