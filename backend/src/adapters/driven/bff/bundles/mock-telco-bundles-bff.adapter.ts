import { Injectable } from '@nestjs/common';
import type { BundlesBffPort, PurchaseResult } from '../../../../domain/ports/bff-ports';
import type { Bundle } from '../../../../domain/types/domain';
import { MockTelcoService } from '../../../../infrastructure/telco/mock-telco.service';

@Injectable()
export class MockTelcoBundlesBffAdapter implements BundlesBffPort {
  constructor(private readonly telco: MockTelcoService) {}

  async getBundles(_userId: string): Promise<Bundle[]> {
    return this.telco.getBundleCatalog();
  }

  async purchaseBundle(userId: string, bundleId: string): Promise<PurchaseResult> {
    return this.telco.purchaseBundle(userId, bundleId);
  }
}
