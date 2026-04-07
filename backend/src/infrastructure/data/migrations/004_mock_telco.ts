import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    -- Subscriber accounts
    CREATE TABLE IF NOT EXISTS telco_accounts (
      user_id              TEXT PRIMARY KEY,
      msisdn               TEXT NOT NULL UNIQUE,
      name                 TEXT NOT NULL,
      balance              REAL NOT NULL DEFAULT 0,
      currency             TEXT NOT NULL DEFAULT 'USD',
      plan_name            TEXT NOT NULL DEFAULT 'Prepaid Basic',
      billing_cycle_start  TEXT NOT NULL,
      billing_cycle_end    TEXT NOT NULL,
      status               TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','closed')),
      last_topup_at        TEXT,
      last_simulated_at    TEXT NOT NULL DEFAULT (datetime('now')),
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Static bundle catalog
    CREATE TABLE IF NOT EXISTS telco_bundles_catalog (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      description    TEXT NOT NULL,
      price          REAL NOT NULL,
      currency       TEXT NOT NULL DEFAULT 'USD',
      data_gb        REAL NOT NULL,
      minutes        INTEGER NOT NULL,
      sms            INTEGER NOT NULL,
      validity_days  INTEGER NOT NULL DEFAULT 30,
      popular        INTEGER NOT NULL DEFAULT 0,
      category       TEXT NOT NULL DEFAULT 'standard' CHECK(category IN ('standard','promo','roaming'))
    );

    -- Active bundles owned by users (subscriptions)
    CREATE TABLE IF NOT EXISTS telco_subscriptions (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL,
      bundle_id      TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','cancelled')),
      data_total_mb  REAL NOT NULL,
      data_used_mb   REAL NOT NULL DEFAULT 0,
      minutes_total  INTEGER NOT NULL,
      minutes_used   INTEGER NOT NULL DEFAULT 0,
      sms_total      INTEGER NOT NULL,
      sms_used       INTEGER NOT NULL DEFAULT 0,
      activated_at   TEXT NOT NULL,
      expires_at     TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES telco_accounts(user_id),
      FOREIGN KEY (bundle_id) REFERENCES telco_bundles_catalog(id)
    );
    CREATE INDEX IF NOT EXISTS idx_telco_subscriptions_user ON telco_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_telco_subscriptions_status ON telco_subscriptions(status);

    -- CDR-like usage events
    CREATE TABLE IF NOT EXISTS telco_usage_records (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL,
      subscription_id  TEXT,
      type             TEXT NOT NULL CHECK(type IN ('data','voice','sms')),
      amount           REAL NOT NULL,
      direction        TEXT NOT NULL DEFAULT 'outbound' CHECK(direction IN ('inbound','outbound')),
      timestamp        TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES telco_accounts(user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_telco_usage_records_user ON telco_usage_records(user_id, type);

    -- Support tickets with lifecycle
    CREATE TABLE IF NOT EXISTS telco_tickets (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
      subject      TEXT NOT NULL,
      description  TEXT NOT NULL DEFAULT '',
      priority     TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','critical')),
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at  TEXT,
      FOREIGN KEY (user_id) REFERENCES telco_accounts(user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_telco_tickets_user ON telco_tickets(user_id);

    -- Static FAQ entries
    CREATE TABLE IF NOT EXISTS telco_faq (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      question  TEXT NOT NULL,
      answer    TEXT NOT NULL,
      category  TEXT NOT NULL DEFAULT 'general'
    );
  `);

  seed(db);
}

function seed(db: Database): void {
  // Only seed if accounts table is empty
  const count = (db.prepare('SELECT COUNT(*) as c FROM telco_accounts').get() as { c: number }).c;
  if (count > 0) return;

  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Billing cycle: current month
  const cycleStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of month

  // --- Account ---
  db.prepare(`
    INSERT INTO telco_accounts (user_id, msisdn, name, balance, currency, plan_name, billing_cycle_start, billing_cycle_end, last_topup_at, last_simulated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'user-1', '+12025551234', 'Alex Morgan', 50.00, 'USD', 'Prepaid Basic',
    cycleStart.toISOString().split('T')[0], cycleEnd.toISOString().split('T')[0],
    new Date(now.getTime() - 3 * 86400000).toISOString().split('T')[0], // 3 days ago
    now.toISOString(),
  );

  // --- Bundle catalog ---
  const insertBundle = db.prepare(`
    INSERT INTO telco_bundles_catalog (id, name, description, price, currency, data_gb, minutes, sms, validity_days, popular, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertBundle.run('b1', 'Starter Pack',    'Perfect for light users',              9.99,  'USD', 2,  100,  50,   30, 0, 'standard');
  insertBundle.run('b2', 'Value Plus',      'Great balance of data and minutes',    19.99, 'USD', 10, 500,  200,  30, 1, 'standard');
  insertBundle.run('b3', 'Unlimited Pro',   'For power users who need it all',      39.99, 'USD', 50, -1,   -1,   30, 0, 'standard');
  insertBundle.run('b4', 'Weekend Pass',    'Unlimited data for the weekend',       4.99,  'USD', 999, 0,    0,    2,  0, 'promo');
  insertBundle.run('b5', 'Travel Roaming',  'Stay connected abroad — 50 countries', 14.99, 'USD', 5,  200,  100,  14, 0, 'roaming');

  // --- Active subscription (Starter Pack, partially consumed) ---
  const activatedAt = new Date(now.getTime() - 10 * 86400000); // 10 days ago
  const expiresAt = new Date(activatedAt.getTime() + 30 * 86400000);

  db.prepare(`
    INSERT INTO telco_subscriptions (id, user_id, bundle_id, status, data_total_mb, data_used_mb, minutes_total, minutes_used, sms_total, sms_used, activated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'sub-001', 'user-1', 'b1', 'active',
    2048, 750,   // 2GB total, ~750MB used
    100, 38,     // 100 min total, 38 used
    50, 12,      // 50 SMS total, 12 used
    activatedAt.toISOString().split('T')[0],
    expiresAt.toISOString().split('T')[0],
  );

  // --- Usage records ---
  const insertUsage = db.prepare(`
    INSERT INTO telco_usage_records (id, user_id, subscription_id, type, amount, direction, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const usageEvents: Array<{ type: 'data' | 'voice' | 'sms'; amount: number; daysAgo: number }> = [
    { type: 'data',  amount: 120, daysAgo: 9 },
    { type: 'data',  amount: 85,  daysAgo: 7 },
    { type: 'voice', amount: 12,  daysAgo: 7 },
    { type: 'data',  amount: 200, daysAgo: 5 },
    { type: 'sms',   amount: 5,   daysAgo: 5 },
    { type: 'voice', amount: 15,  daysAgo: 4 },
    { type: 'data',  amount: 150, daysAgo: 3 },
    { type: 'sms',   amount: 3,   daysAgo: 2 },
    { type: 'voice', amount: 8,   daysAgo: 1 },
    { type: 'data',  amount: 195, daysAgo: 0 },
  ];

  for (const event of usageEvents) {
    const ts = new Date(now.getTime() - event.daysAgo * 86400000);
    ts.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60)); // randomize time of day
    insertUsage.run(
      `cdr-${event.type}-${event.daysAgo}-${Math.random().toString(36).slice(2, 6)}`,
      'user-1', 'sub-001', event.type, event.amount, 'outbound',
      ts.toISOString(),
    );
  }

  // --- Tickets ---
  db.prepare(`
    INSERT INTO telco_tickets (id, user_id, status, subject, description, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'TK-1024', 'user-1', 'open', 'Data connectivity issues in downtown area',
    'Experiencing slow data speeds between 5-8 PM in the downtown financial district.',
    'medium',
    new Date(now.getTime() - 2 * 86400000).toISOString(),
    new Date(now.getTime() - 2 * 86400000).toISOString(),
  );

  db.prepare(`
    INSERT INTO telco_tickets (id, user_id, status, subject, description, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'TK-1019', 'user-1', 'in_progress', 'Incorrect billing amount on last invoice',
    'Last invoice shows $45.00 but my plan is $9.99/month with no extra usage charges.',
    'high',
    new Date(now.getTime() - 5 * 86400000).toISOString(),
    new Date(now.getTime() - 1 * 86400000).toISOString(),
  );

  // --- FAQ ---
  const insertFaq = db.prepare('INSERT INTO telco_faq (question, answer, category) VALUES (?, ?, ?)');
  insertFaq.run('How do I check my data balance?',          'You can ask me anytime! Just type "check my usage" or "show my balance".', 'billing');
  insertFaq.run('How do I activate a new bundle?',          'Browse available bundles by asking "what bundles are available?" and select one to activate.', 'bundles');
  insertFaq.run('How do I contact a live agent?',           'Say "connect me to an agent" and we\'ll route you to the next available representative.', 'support');
  insertFaq.run('What happens when my bundle expires?',     'Your bundle allowances reset. Any unused data, minutes, or SMS do not carry over. You can purchase a new bundle anytime.', 'bundles');
  insertFaq.run('Can I have multiple active bundles?',      'Yes! You can stack bundles. Usage is deducted from the bundle that expires soonest first.', 'bundles');

  console.log('[MockTelco] Seed data inserted');
}

export function down(db: Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_telco_usage_records_user;
    DROP INDEX IF EXISTS idx_telco_subscriptions_status;
    DROP INDEX IF EXISTS idx_telco_subscriptions_user;
    DROP INDEX IF EXISTS idx_telco_tickets_user;
    DROP TABLE IF EXISTS telco_usage_records;
    DROP TABLE IF EXISTS telco_subscriptions;
    DROP TABLE IF EXISTS telco_tickets;
    DROP TABLE IF EXISTS telco_faq;
    DROP TABLE IF EXISTS telco_bundles_catalog;
    DROP TABLE IF EXISTS telco_accounts;
  `);
}
