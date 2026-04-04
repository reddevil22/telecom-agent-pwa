import { Injectable, Optional } from '@nestjs/common';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Balance, Bundle, OwnedBundle, UsageEntry, SupportTicket } from '../../domain/types/domain';

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
    const data = this.load<UserData<Balance>>('balances.json');
    const existing = data[userId];
    if (!existing) throw new Error(`User ${userId} not found`);
    const updated: Balance = {
      ...existing,
      current: existing.current - amount,
    };
    data[userId] = updated;
    this.save('balances.json', data);
    return updated;
  }

  addOwnedBundle(userId: string, bundleId: string, validityDays: number): OwnedBundle {
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
    this.save('owned-bundles.json', data);
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
      return cached as T;
    }
    const raw = readFileSync(join(this.dataDir, filename), 'utf-8');
    const parsed = JSON.parse(raw) as T;
    this.cache.set(filename, parsed);
    return parsed;
  }

  private save<T>(filename: string, data: T): void {
    const filePath = join(this.dataDir, filename);
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.cache.set(filename, data);
  }
}
