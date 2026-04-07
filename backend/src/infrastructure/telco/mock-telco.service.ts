import { Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { SqliteConnectionService } from '../data/sqlite-connection.service';
import type { Balance, Bundle, UsageEntry, SupportTicket } from '../../domain/types/domain';
import { randomUUID } from 'crypto';

export interface TelcoAccount {
  user_id: string;
  msisdn: string;
  name: string;
  balance: number;
  currency: string;
  plan_name: string;
  billing_cycle_start: string;
  billing_cycle_end: string;
  status: string;
  last_topup_at: string | null;
  last_simulated_at: string;
}

export interface PurchaseResult {
  success: boolean;
  message: string;
  balance: Balance;
  bundle: Bundle | null;
}

@Injectable()
export class MockTelcoService {
  private readonly db: Database;
  private readonly simulationIntervalMs: number;

  constructor(
    connection: SqliteConnectionService,
  ) {
    this.db = connection.getDatabase();
    this.simulationIntervalMs = parseInt(
      process.env.TELCO_SIMULATION_INTERVAL_MS ?? '60000',
      10,
    );
  }

  // ── Account & Balance ──

  getAccount(userId: string): TelcoAccount | null {
    return this.db
      .prepare('SELECT * FROM telco_accounts WHERE user_id = ?')
      .get(userId) as TelcoAccount | null;
  }

  getBalance(userId: string): Balance {
    const account = this.requireAccount(userId);
    return this.accountToBalance(account);
  }

  topUp(userId: string, amount: number): Balance {
    const account = this.requireAccount(userId);
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE telco_accounts SET balance = balance + ?, last_topup_at = ?, updated_at = ? WHERE user_id = ?')
      .run(amount, now, now, userId);
    return this.getBalance(userId);
  }

  deductBalance(userId: string, amount: number): Balance {
    const account = this.requireAccount(userId);
    if (account.balance < amount) {
      throw new Error('Insufficient balance');
    }
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE telco_accounts SET balance = balance - ?, updated_at = ? WHERE user_id = ?')
      .run(amount, now, userId);
    return this.getBalance(userId);
  }

  // ── Bundle Catalog ──

  getBundleCatalog(): Bundle[] {
    const rows = this.db
      .prepare('SELECT * FROM telco_bundles_catalog ORDER BY price ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map(this.catalogRowToBundle);
  }

  getBundleById(bundleId: string): Bundle | undefined {
    const row = this.db
      .prepare('SELECT * FROM telco_bundles_catalog WHERE id = ?')
      .get(bundleId) as Record<string, unknown> | undefined;
    return row ? this.catalogRowToBundle(row) : undefined;
  }

  // ── Subscriptions (owned bundles) ──

  purchaseBundle(userId: string, bundleId: string): PurchaseResult {
    this.simulateTick(userId);

    const catalogRow = this.db
      .prepare('SELECT * FROM telco_bundles_catalog WHERE id = ?')
      .get(bundleId) as Record<string, unknown> | undefined;

    if (!catalogRow) {
      return {
        success: false,
        message: 'Bundle not found',
        balance: this.getBalance(userId),
        bundle: null,
      };
    }

    const account = this.requireAccount(userId);
    const price = catalogRow.price as number;

    if (account.balance < price) {
      return {
        success: false,
        message: 'Insufficient balance',
        balance: this.accountToBalance(account),
        bundle: this.catalogRowToBundle(catalogRow),
      };
    }

    // Create subscription
    const now = new Date();
    const validityDays = catalogRow.validity_days as number;
    const expiresAt = new Date(now.getTime() + validityDays * 86400000);
    const subId = `sub-${randomUUID().slice(0, 8)}`;
    const dataTotalMb = (catalogRow.data_gb as number) * 1024;

    this.db
      .prepare(`
        INSERT INTO telco_subscriptions (id, user_id, bundle_id, status, data_total_mb, data_used_mb, minutes_total, minutes_used, sms_total, sms_used, activated_at, expires_at)
        VALUES (?, ?, ?, 'active', ?, 0, ?, 0, ?, 0, ?, ?)
      `)
      .run(
        subId, userId, bundleId,
        dataTotalMb,
        catalogRow.minutes as number,
        catalogRow.sms as number,
        now.toISOString().split('T')[0],
        expiresAt.toISOString().split('T')[0],
      );

    // Deduct balance
    const updatedBalance = this.deductBalance(userId, price);

    return {
      success: true,
      message: 'Bundle purchased successfully',
      balance: updatedBalance,
      bundle: this.catalogRowToBundle(catalogRow),
    };
  }

  // ── Usage ──

  getUsage(userId: string): UsageEntry[] {
    this.simulateTick(userId);
    this.expireBundles();

    // Aggregate from active subscriptions
    const rows = this.db
      .prepare(`
        SELECT
          SUM(data_total_mb) as data_total_mb,
          SUM(data_used_mb) as data_used_mb,
          SUM(minutes_total) as minutes_total,
          SUM(minutes_used) as minutes_used,
          SUM(sms_total) as sms_total,
          SUM(sms_used) as sms_used
        FROM telco_subscriptions
        WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
      `)
      .get(userId) as {
        data_total_mb: number | null;
        data_used_mb: number | null;
        minutes_total: number | null;
        minutes_used: number | null;
        sms_total: number | null;
        sms_used: number | null;
      };

    const now = new Date();
    const period = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    const entries: UsageEntry[] = [];

    if (rows.data_total_mb !== null && rows.data_total_mb > 0) {
      entries.push({
        type: 'data',
        used: Math.round((rows.data_used_mb ?? 0) / 1024 * 10) / 10, // MB → GB, 1 decimal
        total: Math.round(rows.data_total_mb / 1024 * 10) / 10,
        unit: 'GB',
        period,
      });
    }

    if (rows.minutes_total !== null && rows.minutes_total > 0) {
      entries.push({
        type: 'voice',
        used: rows.minutes_used ?? 0,
        total: rows.minutes_total === -1 ? 9999 : rows.minutes_total, // -1 = unlimited, display as large number
        unit: 'min',
        period,
      });
    }

    if (rows.sms_total !== null && rows.sms_total > 0) {
      entries.push({
        type: 'sms',
        used: rows.sms_used ?? 0,
        total: rows.sms_total === -1 ? 9999 : rows.sms_total,
        unit: 'SMS',
        period,
      });
    }

    return entries;
  }

  // ── Support ──

  getTickets(userId: string): SupportTicket[] {
    this.simulateTick(userId);
    return this.db
      .prepare('SELECT * FROM telco_tickets WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as SupportTicket[];
  }

  createTicket(userId: string, subject: string, description: string): SupportTicket {
    const id = `TK-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT INTO telco_tickets (id, user_id, status, subject, description, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, 'open', subject, description, 'medium', now, now);
    return {
      id,
      status: 'open',
      subject,
      description,
      createdAt: now.split('T')[0],
    };
  }

  getFaq(): Array<{ question: string; answer: string }> {
    return this.db
      .prepare('SELECT question, answer FROM telco_faq')
      .all() as Array<{ question: string; answer: string }>;
  }

  // ── Time-aware lazy simulation ──

  private simulateTick(userId: string): void {
    const account = this.getAccount(userId);
    if (!account) return;

    const lastSim = new Date(account.last_simulated_at).getTime();
    const now = Date.now();

    if (now - lastSim < this.simulationIntervalMs) return;

    // 1. Add random usage to active subscriptions
    const subs = this.db
      .prepare("SELECT * FROM telco_subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')")
      .all(userId) as Array<{ id: string; data_used_mb: number; minutes_used: number; sms_used: number; data_total_mb: number; minutes_total: number; sms_total: number }>;

    for (const sub of subs) {
      // Data: 50–300 MB
      const dataAmount = 50 + Math.random() * 250;
      // Voice: 1–15 minutes
      const voiceAmount = 1 + Math.floor(Math.random() * 15);
      // SMS: 0–3
      const smsAmount = Math.floor(Math.random() * 4);

      if (sub.data_total_mb > 0 && sub.data_total_mb !== -1) {
        this.db
          .prepare('UPDATE telco_subscriptions SET data_used_mb = data_used_mb + ? WHERE id = ?')
          .run(dataAmount, sub.id);
        this.insertUsageRecord(userId, sub.id, 'data', dataAmount);
      }
      if (sub.minutes_total > 0 && sub.minutes_total !== -1) {
        this.db
          .prepare('UPDATE telco_subscriptions SET minutes_used = minutes_used + ? WHERE id = ?')
          .run(voiceAmount, sub.id);
        this.insertUsageRecord(userId, sub.id, 'voice', voiceAmount);
      }
      if (sub.sms_total > 0 && sub.sms_total !== -1) {
        this.db
          .prepare('UPDATE telco_subscriptions SET sms_used = sms_used + ? WHERE id = ?')
          .run(smsAmount, sub.id);
        this.insertUsageRecord(userId, sub.id, 'sms', smsAmount);
      }
    }

    // 2. Progress ticket statuses
    this.progressTickets(userId);

    // 3. Update last_simulated_at
    const nowISO = new Date(now).toISOString();
    this.db
      .prepare('UPDATE telco_accounts SET last_simulated_at = ?, updated_at = ? WHERE user_id = ?')
      .run(nowISO, nowISO, userId);
  }

  private insertUsageRecord(userId: string, subscriptionId: string, type: 'data' | 'voice' | 'sms', amount: number): void {
    this.db
      .prepare('INSERT INTO telco_usage_records (id, user_id, subscription_id, type, amount, direction, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(`cdr-${randomUUID().slice(0, 8)}`, userId, subscriptionId, type, amount, 'outbound', new Date().toISOString());
  }

  private expireBundles(): void {
    this.db
      .prepare("UPDATE telco_subscriptions SET status = 'expired' WHERE status = 'active' AND expires_at <= datetime('now')")
      .run();
  }

  private progressTickets(userId: string): void {
    const now = Date.now();
    const TWO_MINUTES = 2 * 60_000;
    const FIVE_MINUTES = 5 * 60_000;

    // open → in_progress after 2 min
    this.db
      .prepare(`
        UPDATE telco_tickets
        SET status = 'in_progress', updated_at = ?
        WHERE user_id = ? AND status = 'open' AND (unixepoch(created_at) * 1000) < ?
      `)
      .run(new Date(now).toISOString(), userId, now - TWO_MINUTES);

    // in_progress → resolved after 5 min
    this.db
      .prepare(`
        UPDATE telco_tickets
        SET status = 'resolved', updated_at = ?, resolved_at = ?
        WHERE user_id = ? AND status = 'in_progress' AND (unixepoch(updated_at) * 1000) < ?
      `)
      .run(new Date(now).toISOString(), new Date(now).toISOString(), userId, now - FIVE_MINUTES);
  }

  // ── Helpers ──

  private requireAccount(userId: string): TelcoAccount {
    const account = this.getAccount(userId);
    if (!account) throw new Error(`Account not found: ${userId}`);
    return account;
  }

  private accountToBalance(account: TelcoAccount): Balance {
    return {
      current: Math.round(account.balance * 100) / 100,
      currency: account.currency,
      lastTopUp: account.last_topup_at ?? 'N/A',
      nextBillingDate: account.billing_cycle_end,
    };
  }

  private catalogRowToBundle(row: Record<string, unknown>): Bundle {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      price: row.price as number,
      currency: (row.currency as string) ?? 'USD',
      dataGB: row.data_gb as number,
      minutes: row.minutes as number,
      sms: row.sms as number,
      validity: `${row.validity_days as number} days`,
      popular: (row.popular as number) === 1 ? true : undefined,
    };
  }
}
