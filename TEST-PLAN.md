# Test Plan: My Account Dashboard Feature

> **Target audience:** Another agent implementing these tests.
> **Feature commit:** `6c814e0` — Account screen with profile, subscriptions, transactions, tickets.
> **Scope:** Backend unit tests, frontend E2E test. No frontend unit test framework exists.

---

## 1. Backend Unit Tests

### 1a. `MockTelcoService.getAccountSummary()` — NEW FILE

**File:** `backend/src/infrastructure/telco/mock-telco.service.spec.ts`

**Setup pattern** — follow existing tests (see `balance-sub-agent.service.spec.ts`):
- Use a real in-memory SQLite database (via `better-sqlite3` with `:memory:`)
- Run migration `004_mock_telco` and `005_add_account_screen_type` to create schema + seed data
- Instantiate `MockTelcoService` with a mock `SqliteConnectionService` that returns the in-memory DB
- Call `jest.clearAllMocks()` in `beforeEach`

**Test cases:**

| # | Test name | Setup | Assertion |
|---|-----------|-------|-----------|
| 1 | returns profile for seed user | default seed | `result.profile.name === 'Alex Chen'`, `msisdn` matches, `plan` is non-empty, `status === 'active'`, `balance.current` is a positive number, `billingCycleStart/End` are ISO dates |
| 2 | returns active subscriptions | default seed (user-1 has Starter Pack) | `result.activeSubscriptions.length >= 1`, first sub has `bundleName`, `bundleId`, `status === 'active'`, positive `dataTotalMb`, `dataUsedMb < dataTotalMb` |
| 3 | returns recent transactions | default seed | `result.recentTransactions.length >= 1`, transactions sorted by timestamp desc, each has `id`, `type` (one of `purchase\|topup\|ticket`), `description`, `timestamp` |
| 4 | returns open tickets | default seed (2 tickets: open + in_progress) | `result.openTickets.length >= 1`, each has `id`, `status !== 'resolved'`, `subject`, `updatedAt` |
| 5 | throws for unknown user | call with `'unknown-user'` | expect `throw /Account not found/` |
| 6 | reflects purchase in transactions | call `purchaseBundle('user-1', 'bundle-2')` then `getAccountSummary` | recentTransactions includes a new `'purchase'` entry for Value Plus |
| 7 | reflects top-up in transactions | call `topUp('user-1', 20)` then `getAccountSummary` | recentTransactions includes a `'topup'` entry, balance increased by 20 |
| 8 | reflects new ticket in open tickets | call `createTicket('user-1', 'Test subject', 'Test desc')` then `getAccountSummary` | openTickets includes new ticket with `status === 'open'` and matching subject |
| 9 | expired bundles excluded from subscriptions | manually set a subscription's `expires_at` to past date, call `getAccountSummary` | that subscription not in `activeSubscriptions` |
| 10 | max 5 transactions returned | create 6+ purchases, call `getAccountSummary` | `result.recentTransactions.length <= 5` |

**Mock for SqliteConnectionService:**

```typescript
// Create in-memory DB with migrations
import Database from 'better-sqlite3';
import { up as run004 } from '../data/migrations/004_mock_telco';
import { up as run005 } from '../data/migrations/005_add_account_screen_type';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Bootstrap _migrations table + base schema (001–003)
  // You can copy the CREATE TABLE statements from migration 001_initial
  // or just run migrations 001–005 in order.
  // Simplified: just run 004 and 005 since they create the telco_* tables
  run004(db);
  run005(db);
  return db;
}

const mockConnection = { getDatabase: () => testDb } as any;
```

Note: Migration 004 only creates `telco_*` tables. The base `conversations`/`messages` tables are not needed for MockTelcoService tests. If `004_mock_telco` has a foreign key to conversations, you may need to create that table first — check the migration file.

### 1b. Sub-agent wiring — MODIFY EXISTING or NEW FILE

**File:** `backend/src/application/sub-agents/account-sub-agent.service.spec.ts` (new)

The account screen uses `SimpleQuerySubAgent` registered inline in `app.agent-module.ts`. Since it's not a dedicated class, test it by instantiating `SimpleQuerySubAgent` directly:

```typescript
import { SimpleQuerySubAgent } from './simple-query-sub-agent.service';
```

| # | Test name | Assertion |
|---|-----------|-----------|
| 1 | returns screenType 'account' | `result.screenData.type === 'account'` |
| 2 | returns account data shape | `result.screenData` has `profile`, `activeSubscriptions`, `recentTransactions`, `openTickets` |
| 3 | processing steps all done | same pattern as balance-sub-agent test |

**Mock the query function:**

```typescript
const mockSummary = {
  profile: { name: 'Test', msisdn: '+1234', plan: 'Basic', status: 'active', balance: { current: 10, currency: 'USD', lastTopUp: '2026-01-01', nextBillingDate: '2026-02-01' }, billingCycleStart: '2026-04-01', billingCycleEnd: '2026-04-30' },
  activeSubscriptions: [],
  recentTransactions: [],
  openTickets: [],
};

const agent = new SimpleQuerySubAgent(
  (_userId) => Promise.resolve(mockSummary),
  { screenType: 'account', processingLabels: { fetching: 'Loading account' } },
);
```

### 1c. Tool registry — VERIFY EXISTING

**File:** `backend/src/domain/constants/tool-registry.ts`

No new test file needed. The existing `tool-resolver.spec.ts` should be checked to see if it covers the new `get_account_summary` entry. If the tool-resolver test iterates all registry entries, verify it passes. If not, add one test:

| # | Test name | Assertion |
|---|-----------|-----------|
| 1 | resolves get_account_summary to correct agent | `resolver.resolve('get_account_summary')` returns the registered sub-agent |

---

## 2. Migration Tests

**File:** `backend/src/infrastructure/data/migrations/005_add_account_screen_type.spec.ts` (new)

| # | Test name | Setup | Assertion |
|---|-----------|-------|-----------|
| 1 | up adds 'account' to CHECK constraint | in-memory DB, create messages table with original constraint (no 'account'), run `up(db)`, then `INSERT INTO messages ... screen_type = 'account'` succeeds |
| 2 | down removes 'account' from CHECK | run `up` then `down`, then `INSERT ... screen_type = 'account'` throws with `CHECK constraint failed` |
| 3 | existing data preserved | insert a row with `screen_type = 'balance'` before migration, run `up`, row still present |

---

## 3. Frontend E2E Test

**File:** `e2e/agent.spec.ts` (modify existing — add a new entry to the `TESTS` array)

Follow the existing pattern exactly:

```typescript
{
  prompt: 'show my account',
  assert: async (page) => {
    await expect(page.getByText('Alex Chen')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Active Subscriptions')).toBeVisible();
    await expect(page.getByText('Starter Pack')).toBeVisible();
    await expect(page.getByText('Recent Activity')).toBeVisible();
  },
},
```

Add it after the existing `'I need help'` test entry.

**Why these assertions:**
- `'Alex Chen'` — verifies profile section renders (seed data name)
- `'Active Subscriptions'` — verifies subscription heading
- `'Starter Pack'` — verifies subscription detail (seed data bundle)
- `'Recent Activity'` — verifies transactions section heading

---

## 4. Files to Create/Modify Summary

| Action | File | Priority |
|--------|------|----------|
| CREATE | `backend/src/infrastructure/telco/mock-telco.service.spec.ts` | P0 |
| CREATE | `backend/src/application/sub-agents/account-sub-agent.service.spec.ts` | P1 |
| CREATE | `backend/src/infrastructure/data/migrations/005_add_account_screen_type.spec.ts` | P1 |
| MODIFY | `e2e/agent.spec.ts` — add account test case to TESTS array | P0 |
| CHECK | `backend/src/application/supervisor/tool-resolver.spec.ts` — verify it covers new tool | P2 |

---

## 5. Verification Steps

After writing all tests:

1. `cd backend && npm test` — all backend tests pass (existing 108 + new)
2. `npm run build` — frontend compiles clean
3. Start backend + frontend, run `npx playwright test` — all E2E tests pass including new account test
4. No regressions in existing test suite
