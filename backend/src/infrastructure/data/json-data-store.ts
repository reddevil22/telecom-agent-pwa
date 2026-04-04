import { Inject, Injectable, Optional } from '@nestjs/common';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Balance, Bundle, OwnedBundle, UsageEntry, SupportTicket } from '../../domain/types/domain';
import type { PinoLogger } from 'nestjs-pino';
import { LOGGER } from '../../domain/tokens';

type UserData<T> = Record<string, T>;

@Injectable()
export class JsonDataStore {
  private readonly dataDir: string;
  private cache = new Map<string, unknown>();

  constructor(
    @Optional() dataDir?: string,
    @Inject(LOGGER) @Optional() private readonly logger?: PinoLogger,
  ) {
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

  getBundleById(bundleId: string): Bundle | undefined {
    const bundles = this.getBundles();
    return bundles.find(b => b.id === bundleId);
  }

  topUp(userId: string, amount: number): Balance {
    const data = this.load<UserData<Balance>>('balances.json');
    const existing = data[userId];
    if (!existing) throw new Error(`User ${userId} not found`);
    const updated: Balance = {
      ...existing,
      current: existing.current + amount,
      lastTopUp: new Date().toISOString().split('T')[0],
    };
    data[userId] = updated;
    this.save('balances.json', data);
    return updated;
  }

  deductBalance(userId: string, amount: number): Balance {
    this.logger?.debug({ userId, amount }, 'deductBalance called');
    const data = this.load<UserData<Balance>>('balances.json');
    const existing = data[userId];
    this.logger?.debug({ userId, balance: existing }, 'Current balance');
    if (!existing) throw new Error(`User ${userId} not found`);
    const updated: Balance = {
      ...existing,
      current: existing.current - amount,
    };
    data[userId] = updated;
    this.logger?.debug({ userId, newBalance: updated }, 'New balance after deduction');
    this.save('balances.json', data);
    this.logger?.debug('Saved balances.json after deduction');
    return updated;
  }

  addOwnedBundle(userId: string, bundleId: string, validityDays: number): OwnedBundle {
    this.logger?.debug({ userId, bundleId }, 'addOwnedBundle called');
    const data = this.load<UserData<OwnedBundle[]>>('owned-bundles.json');
    const now = new Date();
    const expires = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);
    const owned: OwnedBundle = {
      bundleId,
      purchasedAt: now.toISOString().split('T')[0],
      expiresAt: expires.toISOString().split('T')[0],
    };
    if (!data[userId]) data[userId] = [];
    data[userId].push(owned);
    this.logger?.debug({ userId, owned }, 'Adding bundle to user');
    this.save('owned-bundles.json', data);
    this.logger?.debug('Saved owned-bundles.json');
    return owned;
  }

  createTicket(userId: string, subject: string, description: string): SupportTicket {
    const data = this.load<{ tickets: UserData<SupportTicket[]>; faq: Array<{ question: string; answer: string }> }>('support.json');
    const ticketId = `TK-${Date.now().toString(36).toUpperCase()}`;
    const ticket: SupportTicket = {
      id: ticketId,
      status: 'open',
      subject,
      description,
      createdAt: new Date().toISOString().split('T')[0],
    };
    if (!data.tickets[userId]) data.tickets[userId] = [];
    data.tickets[userId].push(ticket);
    this.save('support.json', data);
    return ticket;
  }

  private load<T>(filename: string): T {
    const cached = this.cache.get(filename);
    if (cached !== undefined) {
      // Return a deep copy to prevent accidental mutation of cached data
      return JSON.parse(JSON.stringify(cached)) as T;
    }
    const raw = readFileSync(join(this.dataDir, filename), 'utf-8');
    const parsed = JSON.parse(raw) as T;
    this.cache.set(filename, parsed);
    return JSON.parse(JSON.stringify(parsed)) as T;
  }

  private save<T>(filename: string, data: T): void {
    const filePath = join(this.dataDir, filename);
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    // Store a copy in cache to prevent external mutations
    this.cache.set(filename, JSON.parse(JSON.stringify(data)));
  }
}
