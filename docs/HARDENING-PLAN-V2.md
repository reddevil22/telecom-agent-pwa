# Backend Hardening Plan v2

Post-analysis implementation plan targeting 5 recommendations. Each task includes exact files, code patterns, and test requirements.

---

## Task 1: Sub-Agent Unit Tests (Coverage 8.6% → 85%+)

**Priority**: High — largest coverage gap, 4 providers + 3 specific sub-agents untested  
**Effort**: Medium  
**Commit scope**: `test(backend): add sub-agent and generic-sub-agent unit tests`

### Files to Create

#### 1a. `backend/src/application/sub-agents/generic-sub-agents.spec.ts`

Test all three generic classes against mock BFF methods:

```typescript
// SimpleQuerySubAgent
- 'returns correct screenType from config'
- 'calls bffMethod with userId'
- 'transforms result via config.transformResult'
- 'returns 3 processing steps all done'
- 'propagates BFF error'

// ActionSubAgent
- 'returns error confirmation when validation fails'
- 'calls executeAction with extracted params on valid input'
- 'returns success confirmation with updatedBalance'
- 'returns error confirmation when action fails'
- 'includes updating step when processingLabels.updating is set'
- 'omits updating step when processingLabels.updating is undefined'

// DualQuerySubAgent
- 'calls both BFF methods in parallel'
- 'transforms combined results'
- 'returns 4 processing steps all done'
- 'propagates error if primary BFF fails'
- 'propagates error if secondary BFF fails'
```

Mock pattern — use inline jest.fn() stubs for BFF methods:
```typescript
const mockBff = jest.fn().mockResolvedValue({ current: 50, currency: 'USD' });
const agent = new SimpleQuerySubAgent(mockBff, { screenType: 'balance', ... });
const result = await agent.handle('user-1');
expect(mockBff).toHaveBeenCalledWith('user-1');
```

#### 1b. `backend/src/application/sub-agents/purchase-bundle-sub-agent.spec.ts`

```typescript
- 'returns error confirmation when bundleId is missing'
- 'returns error confirmation when bundleId is empty string'
- 'calls bundlesBff.purchaseBundle with userId and bundleId'
- 'returns success confirmation with bundle name and new balance'
- 'returns error confirmation when purchase fails (insufficient balance)'
- 'includes 3 processing steps'
```

Mock: `{ purchaseBundle: jest.fn() }` as `BundlesBffPort`

#### 1c. `backend/src/application/sub-agents/create-ticket-sub-agent.spec.ts`

```typescript
- 'calls supportBff.createTicket with userId, subject, description'
- 'defaults subject to "General Inquiry" when not provided'
- 'defaults description to empty string when not provided'
- 'returns success confirmation with ticketId and subject'
- 'includes 2 processing steps'
- 'propagates BFF error'
```

Mock: `{ createTicket: jest.fn() }` as `SupportBffPort`

#### 1d. `backend/src/application/sub-agents/view-bundle-details-sub-agent.spec.ts`

```typescript
- 'returns unknown screen when bundleId is missing'
- 'returns unknown screen when bundleId is empty'
- 'returns unknown screen when bundle not found in catalog'
- 'returns bundleDetail screen with bundle and currentBalance'
- 'calls bundlesBff.getBundles then balanceBff.getBalance'
- 'includes 3 processing steps on success'
- 'includes 1 processing step on validation failure'
```

Mock: `{ getBundles: jest.fn() }` + `{ getBalance: jest.fn() }`

#### 1e. `backend/src/application/sub-agents/billing-agents.provider.spec.ts`

```typescript
- 'createBillingAgentRegistrations returns 2 registrations'
- 'registers check_balance tool'
- 'registers top_up tool'
- 'check_balance agent calls balanceBff.getBalance'
- 'top_up agent validates amount > 0'
- 'top_up agent rejects non-numeric amount'
- 'top_up agent calls balanceBff.topUp with parsed amount'
```

#### 1f. `backend/src/application/sub-agents/bundle-agents.provider.spec.ts`

```typescript
- 'createBundleAgentRegistrations returns 3 registrations'
- 'registers list_bundles, view_bundle_details, purchase_bundle tools'
- 'list_bundles agent calls bundlesBff.getBundles'
```

#### 1g. `backend/src/application/sub-agents/support-agents.provider.spec.ts`

```typescript
- 'createSupportAgentRegistrations returns 2 registrations'
- 'registers get_support and create_ticket tools'
- 'get_support agent calls getTickets and getFaq in parallel'
```

#### 1h. `backend/src/application/sub-agents/account-agents.provider.spec.ts`

```typescript
- 'createAccountAgentRegistrations returns 2 registrations'
- 'registers check_usage and get_account_summary tools'
```

### Expected Impact

- `application/sub-agents/` coverage: 8.6% → ~85%
- Overall statement coverage: ~57% → ~68%
- ~45 new test cases across 8 new spec files

---

## Task 2: Per-Arg Schema Validation for Tool Arguments

**Priority**: High — closes input validation gap for LLM-generated tool args  
**Effort**: Small  
**Commit scope**: `fix(backend): add per-arg constraint validation for tool calls`

### Files to Modify

#### 2a. `backend/src/domain/constants/tool-registry.ts`

Add a `ToolArgConstraints` type and a `TOOL_ARG_CONSTRAINTS` export alongside existing `TOOL_ARG_SCHEMAS`:

```typescript
export interface ArgConstraint {
  maxLength: number;
  pattern?: RegExp;
}

export const TOOL_ARG_CONSTRAINTS: Readonly<Record<string, Record<string, ArgConstraint>>> = {
  check_balance:       { userId: { maxLength: 64 } },
  list_bundles:        { userId: { maxLength: 64 } },
  check_usage:         { userId: { maxLength: 64 } },
  get_support:         { userId: { maxLength: 64 } },
  get_account_summary: { userId: { maxLength: 64 } },
  view_bundle_details: {
    userId:   { maxLength: 64 },
    bundleId: { maxLength: 16, pattern: /^b\d{1,3}$/ },
  },
  purchase_bundle: {
    userId:   { maxLength: 64 },
    bundleId: { maxLength: 16, pattern: /^b\d{1,3}$/ },
  },
  top_up: {
    userId: { maxLength: 64 },
    amount: { maxLength: 10, pattern: /^\d+(\.\d{1,2})?$/ },
  },
  create_ticket: {
    userId:      { maxLength: 64 },
    subject:     { maxLength: 200 },
    description: { maxLength: 1000 },
  },
};
```

Re-export from `security-constants.ts` for backward compatibility.

#### 2b. `backend/src/application/supervisor/tool-validation.service.ts`

After the existing string-type check loop, add constraint validation:

```typescript
import { TOOL_ARG_CONSTRAINTS } from '../../domain/constants/security-constants';

// Inside validate(), after the for-of type-check loop:
const constraints = TOOL_ARG_CONSTRAINTS[toolCall.function.name];
if (constraints) {
  for (const [key, constraint] of Object.entries(constraints)) {
    const value = args[key];
    if (typeof value !== 'string') continue; // already rejected above
    if (value.length > constraint.maxLength) {
      return INVALID_TOOL_ERROR;
    }
    if (constraint.pattern && !constraint.pattern.test(value)) {
      return INVALID_TOOL_ERROR;
    }
  }
}
```

#### 2c. `backend/src/application/supervisor/tool-validation.service.spec.ts`

Add new test cases:

```typescript
- 'rejects userId exceeding 64 chars'
- 'rejects bundleId not matching pattern (e.g., "DROP TABLE")'
- 'accepts valid bundleId b1-b5'
- 'rejects top_up amount with letters'
- 'rejects top_up amount with negative sign'
- 'accepts valid top_up amount "50"'
- 'accepts valid top_up amount "19.99"'
- 'rejects subject exceeding 200 chars'
- 'rejects description exceeding 1000 chars'
```

### Security Benefit

Prevents LLM from injecting:
- Arbitrarily long strings (DoS via oversized args)
- SQL-like payloads in bundleId (`"DROP TABLE"` → blocked by `/^b\d{1,3}$/`)
- Non-numeric top-up amounts (`"999999999999"` passes type check but `"abc"` is caught)

---

## Task 3: Database Index Migration

**Priority**: Medium — performance improvement for growing datasets  
**Effort**: Small  
**Commit scope**: `perf(backend): add database indexes on hot query paths`

### Files to Create

#### 3a. `backend/src/infrastructure/data/migrations/006_add_indexes.ts`

```typescript
import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conversations_user_id
      ON conversations(user_id);

    CREATE INDEX IF NOT EXISTS idx_conversations_user_deleted
      ON conversations(user_id, deleted_at);

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages(conversation_id);

    CREATE INDEX IF NOT EXISTS idx_telco_tickets_account_id
      ON telco_tickets(account_id);

    CREATE INDEX IF NOT EXISTS idx_telco_usage_records_account_id
      ON telco_usage_records(account_id);

    CREATE INDEX IF NOT EXISTS idx_telco_subscriptions_account_id
      ON telco_subscriptions(account_id);
  `);
}
```

### Files to Modify

#### 3b. `backend/src/infrastructure/data/sqlite-connection.service.ts`

Add import and migration entry:

```typescript
import { up as runMigration006 } from './migrations/006_add_indexes';

// In MIGRATIONS array:
{ id: '006_add_indexes', up: runMigration006 },
```

### Verification

After startup, confirm indexes exist:
```sql
SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%';
```

Idempotent via `CREATE INDEX IF NOT EXISTS` — safe to rerun.

---

## Task 4: LLM Retry with Exponential Backoff

**Priority**: Medium — current single retry with flat 1s delay is suboptimal for 429s  
**Effort**: Small  
**Commit scope**: `feat(backend): upgrade LLM retry to exponential backoff`

### Files to Modify

#### 4a. `backend/src/domain/constants/security-constants.ts`

Add retry configuration:

```typescript
export const LLM_RETRY = {
  MAX_RETRIES: 2,                          // 1 initial + 2 retries = 3 total
  BASE_DELAY_MS: 500,                      // 500ms → 1000ms
  RETRYABLE_STATUS_CODES: [429, 502, 503, 504],
} as const;
```

#### 4b. `backend/src/adapters/driven/llm/openai-compatible.adapter.ts`

Replace the current try/catch single-retry pattern in `chatCompletion()`:

```typescript
import { LLM_RETRY } from '../../../domain/constants/security-constants';

async chatCompletion(params: ChatCompletionParams): Promise<LlmChatResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= LLM_RETRY.MAX_RETRIES; attempt++) {
    try {
      return await this.requestOnce(params);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= LLM_RETRY.MAX_RETRIES || !this.isTransientError(lastError)) {
        throw lastError;
      }

      const delayMs = LLM_RETRY.BASE_DELAY_MS * Math.pow(2, attempt);
      this.logger?.warn(
        { attempt: attempt + 1, delayMs, err: lastError.message },
        'LLM transient error, retrying',
      );
      await this.delay(delayMs);
    }
  }

  throw lastError!;
}
```

Update `isTransientError()` to use the constant:

```typescript
private isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message.includes('timed out')) return true;
  if (error.message.includes('network request failed')) return true;
  return LLM_RETRY.RETRYABLE_STATUS_CODES.some(
    code => error.message.includes(`${code}`)
  );
}
```

#### 4c. `backend/src/adapters/driven/llm/openai-compatible.adapter.spec.ts`

Add/update retry tests:

```typescript
- 'retries on transient 503 and succeeds on second attempt'
- 'retries on timeout and succeeds on second attempt'
- 'retries on 429 (rate limited)'
- 'does not retry on 400 Bad Request'
- 'does not retry on 401 Unauthorized'
- 'exhausts retries and throws final error after MAX_RETRIES'
- 'uses exponential delay between retries (500ms, 1000ms)'
```

### Timing Impact

Worst case (all 3 attempts fail): 500ms + 1000ms = 1.5s added delay.  
Circuit breaker only sees the final failure after retries exhausted.

---

## Task 5: Fix E2E Worker Leak Warning

**Priority**: Low — cosmetic but indicates improper teardown  
**Effort**: Small  
**Commit scope**: `fix(backend): resolve e2e worker leak warning`

### Diagnosis

The Jest warning "A worker process has failed to exit gracefully" indicates a timer or connection that outlives `app.close()`. Likely candidates:

1. **IntentCacheService** — runs a cleanup interval every 2 minutes
2. **InMemoryScreenCache** — runs a cleanup interval every 2 minutes
3. **InMemoryRateLimiterAdapter** — may have a cleanup timer
4. **MockTelcoService** — simulation tick interval

### Files to Check/Modify

#### 5a. Run diagnosis

```bash
cd backend && npx jest --detectOpenHandles test/app.e2e-spec.ts 2>&1 | tail -20
```

#### 5b. Likely fix in `backend/test/app.e2e-spec.ts`

Add explicit cleanup in `afterAll`:

```typescript
afterAll(async () => {
  await app.close();
  // Allow pending timers to drain
  await new Promise(resolve => setTimeout(resolve, 100));
});
```

If that's insufficient, ensure services with intervals implement `OnModuleDestroy` properly and that their `clearInterval` calls use the correct handle. Check:

- `IntentCacheService.onModuleDestroy()` — should `clearInterval` its cleanup timer
- `InMemoryScreenCacheAdapter.onModuleDestroy()` — should `clearInterval` its cleanup timer
- `InMemoryRateLimiterAdapter` — check if it has a cleanup timer

The `unref()` pattern on timers should prevent blocking, but Jest's worker detection may still flag them. The `--forceExit` flag in `jest-e2e.json` is a workaround but masks the issue.

---

## Execution Order

```
Phase 1 (parallel):
  Task 2 (arg validation) — small, high impact, no dependencies
  Task 3 (indexes)        — small, independent

Phase 2:
  Task 4 (retry backoff)  — small, builds on security-constants from Task 2
  Task 5 (worker leak)    — small, diagnostic

Phase 3:
  Task 1 (sub-agent tests) — largest task, write after code changes stabilize
```

### Coverage Target After All Tasks

| Area | Current | Target |
|------|---------|--------|
| `application/sub-agents/` | 8.6% | 85%+ |
| `application/supervisor/` | 77% | 80%+ |
| `adapters/driven/llm/` | 91% | 95%+ |
| `domain/` | 100% | 100% |
| **Overall** | **57%** | **70%+** |

All tasks are independently deployable and backward-compatible.
