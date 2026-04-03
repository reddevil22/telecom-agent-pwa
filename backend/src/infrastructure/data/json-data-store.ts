import { Injectable, Optional } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Balance, Bundle, UsageEntry, SupportTicket } from '../../domain/types/domain';

type UserData<T> = Record<string, T>;

@Injectable()
export class JsonDataStore {
  private readonly dataDir: string;
  private cache = new Map<string, unknown>();

  constructor(@Optional() dataDir?: string) {
    this.dataDir = dataDir ?? join(__dirname, '..', '..', 'data');
  }

  getBalance(userId: string): Balance | null {
    const data = this.load<UserData<Balance>>('balances.json');
    return data[userId] ?? null;
  }

  getBundles(): Bundle[] {
    return this.load<Bundle[]>('bundles.json');
  }

  getUsage(userId: string): UsageEntry[] {
    const data = this.load<UserData<UsageEntry[]>>('usage.json');
    return data[userId] ?? [];
  }

  getTickets(userId: string): SupportTicket[] {
    const data = this.load<{ tickets: UserData<SupportTicket[]> }>('support.json');
    return data.tickets[userId] ?? [];
  }

  getFaq(): Array<{ question: string; answer: string }> {
    const data = this.load<{ faq: Array<{ question: string; answer: string }> }>('support.json');
    return data.faq;
  }

  private load<T>(filename: string): T {
    const cached = this.cache.get(filename);
    if (cached !== undefined) {
      return cached as T;
    }
    const raw = readFileSync(join(this.dataDir, filename), 'utf-8');
    const parsed = JSON.parse(raw) as T;
    this.cache.set(filename, parsed);
    return parsed;
  }
}
