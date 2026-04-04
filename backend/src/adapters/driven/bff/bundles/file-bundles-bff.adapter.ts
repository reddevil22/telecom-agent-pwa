import { Injectable } from '@nestjs/common';
import type { BundlesBffPort, PurchaseResult } from '../../../../domain/ports/bff-ports';
import type { Bundle } from '../../../../domain/types/domain';
import { JsonDataStore } from '../../../../infrastructure/data/json-data-store';

@Injectable()
export class FileBundlesBffAdapter implements BundlesBffPort {
  constructor(private readonly store: JsonDataStore) {}

  async getBundles(_userId: string): Promise<Bundle[]> {
    return this.store.getBundles();
  }

  async purchaseBundle(userId: string, bundleId: string): Promise<PurchaseResult> {
    const bundle = this.store.getBundleById(bundleId);
    if (!bundle) {
      return { success: false, message: 'Bundle not found', balance: await this.store.getBalance(userId) ?? { current: 0, currency: 'USD', lastTopUp: 'N/A', nextBillingDate: 'N/A' }, bundle: null };
    }

    const balance = this.store.getBalance(userId);
    if (!balance || balance.current < bundle.price) {
      return { success: false, message: 'Insufficient balance', balance: balance ?? { current: 0, currency: 'USD', lastTopUp: 'N/A', nextBillingDate: 'N/A' }, bundle };
    }

    const updatedBalance = this.store.deductBalance(userId, bundle.price);
    this.store.addOwnedBundle(userId, bundleId, 30);
    return { success: true, message: 'Bundle purchased successfully', balance: updatedBalance, bundle };
  }
}
