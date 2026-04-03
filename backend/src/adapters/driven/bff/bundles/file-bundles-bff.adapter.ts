import { Injectable } from '@nestjs/common';
import type { BundlesBffPort } from '../../../../domain/ports/bff-ports';
import type { Bundle } from '../../../../domain/types/domain';
import { JsonDataStore } from '../../../../infrastructure/data/json-data-store';

@Injectable()
export class FileBundlesBffAdapter implements BundlesBffPort {
  constructor(private readonly store: JsonDataStore) {}

  async getBundles(_userId: string): Promise<Bundle[]> {
    return this.store.getBundles();
  }
}
