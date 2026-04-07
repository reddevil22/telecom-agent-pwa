import Database from 'better-sqlite3';
import { up as run001 } from '../data/migrations/001_initial';
import { up as run002 } from '../data/migrations/002_add_confirmation_screen_type';
import { up as run003 } from '../data/migrations/003_add_bundle_detail_screen_type';
import { up as run004 } from '../data/migrations/004_mock_telco';
import { up as run005 } from '../data/migrations/005_add_account_screen_type';
import { MockTelcoService } from './mock-telco.service';
import type { SqliteConnectionService } from '../data/sqlite-connection.service';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  run001(db);
  run002(db);
  run003(db);
  run004(db);
  run005(db);
  return db;
}

function createMockConnection(db: Database.Database): SqliteConnectionService {
  return { getDatabase: () => db } as unknown as SqliteConnectionService;
}

describe('MockTelcoService.getAccountSummary()', () => {
  let db: Database.Database;
  let service: MockTelcoService;

  beforeEach(() => {
    db = createTestDb();
    service = new MockTelcoService(createMockConnection(db));
  });

  afterEach(() => {
    db.close();
  });

  // Seed data for user-1 (from migration 004):
  // name: 'Alex Morgan', msisdn: '+12025551234', plan: 'Prepaid Basic',
  // balance: 50.00, status: 'active'
  // 1 active subscription: sub-001 (Starter Pack / b1)
  // 2 tickets: TK-1024 (open), TK-1019 (in_progress)

  it('returns profile for seed user', () => {
    const result = service.getAccountSummary('user-1');
    expect(result.profile.name).toBe('Alex Morgan');
    expect(result.profile.msisdn).toBe('+12025551234');
    expect(result.profile.plan).toBe('Prepaid Basic');
    expect(result.profile.status).toBe('active');
    expect(result.profile.balance.current).toBeGreaterThan(0);
    expect(result.profile.billingCycleStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.profile.billingCycleEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns active subscriptions', () => {
    const result = service.getAccountSummary('user-1');
    expect(result.activeSubscriptions.length).toBeGreaterThanOrEqual(1);
    const sub = result.activeSubscriptions[0];
    expect(sub.bundleName).toBe('Starter Pack');
    expect(sub.bundleId).toBe('b1');
    expect(sub.status).toBe('active');
    expect(sub.dataTotalMb).toBeGreaterThan(0);
    expect(sub.dataUsedMb).toBeLessThan(sub.dataTotalMb);
  });

  it('returns recent transactions', () => {
    const result = service.getAccountSummary('user-1');
    expect(result.recentTransactions.length).toBeGreaterThanOrEqual(1);
    const tx = result.recentTransactions[0];
    expect(tx.id).toBeDefined();
    expect(['purchase', 'topup', 'ticket']).toContain(tx.type);
    expect(tx.description).toBeDefined();
    expect(tx.timestamp).toBeDefined();
  });

  it('returns open tickets', () => {
    const result = service.getAccountSummary('user-1');
    expect(result.openTickets.length).toBeGreaterThanOrEqual(1);
    for (const ticket of result.openTickets) {
      expect(ticket.status).not.toBe('resolved');
      expect(ticket.subject).toBeDefined();
      expect(ticket.id).toBeDefined();
    }
  });

  it('throws for unknown user', () => {
    expect(() => service.getAccountSummary('unknown-user')).toThrow(/Account not found/);
  });

  it('reflects purchase in transactions', () => {
    service.purchaseBundle('user-1', 'b2');
    const result = service.getAccountSummary('user-1');

    const purchaseTx = result.recentTransactions.find(tx => tx.type === 'purchase');
    expect(purchaseTx).toBeDefined();
    expect(purchaseTx!.description).toContain('Purchased');
  });

  it('reflects top-up in transactions', () => {
    const balanceBefore = service.getBalance('user-1');
    service.topUp('user-1', 20);
    const result = service.getAccountSummary('user-1');

    const topupTx = result.recentTransactions.find(tx => tx.type === 'topup');
    expect(topupTx).toBeDefined();
    expect(service.getBalance('user-1').current).toBe(balanceBefore.current + 20);
  });

  it('reflects new ticket in open tickets', () => {
    service.createTicket('user-1', 'Test subject', 'Test description');
    const result = service.getAccountSummary('user-1');

    const newTicket = result.openTickets.find(t => t.subject === 'Test subject');
    expect(newTicket).toBeDefined();
    expect(newTicket!.status).toBe('open');
  });

  it('excludes expired bundles from subscriptions', () => {
    // Set expires_at to past date
    db.prepare("UPDATE telco_subscriptions SET expires_at = '2020-01-01' WHERE id = 'sub-001'").run();

    const result = service.getAccountSummary('user-1');
    const expired = result.activeSubscriptions.find(s => s.subscriptionId === 'sub-001');
    expect(expired).toBeUndefined();
  });

  it('returns max 5 transactions', () => {
    // Purchase multiple bundles
    const bundles = ['b2', 'b3', 'b4', 'b5'];
    for (const bundleId of bundles) {
      try {
        service.purchaseBundle('user-1', bundleId);
      } catch {
        // insufficient balance or other — ignore
      }
    }

    const result = service.getAccountSummary('user-1');
    expect(result.recentTransactions.length).toBeLessThanOrEqual(5);
  });
});
