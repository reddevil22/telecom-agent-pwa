# Backend Hardening — Implementation Plan

Based on the architecture analysis, this plan addresses 6 recommendations in priority order. Each task includes the exact files to modify, code changes needed, and test requirements.

---

## Task 1: Schema Validation for LLM Tool Arguments

**Priority**: High — prevents malformed/malicious args from reaching sub-agents  
**Effort**: Small  
**Files**:
- `backend/src/application/supervisor/supervisor.service.ts` (modify)
- `backend/src/domain/constants/tool-registry.ts` (modify)
- `backend/src/application/supervisor/tool-validation.service.ts` (modify)
- `backend/src/application/supervisor/tool-validation.service.spec.ts` (extend)

### Problem

Tool arguments from the LLM are parsed via `JSON.parse` at line ~377 of `supervisor.service.ts` and passed directly to sub-agents. The existing `validateToolCallWithError` (lines 333–361) checks:
- Tool name is in `ALLOWED_TOOLS`
- Arg keys match `TOOL_ARG_SCHEMAS`
- All values are strings

But it does **not** validate:
- Required vs optional args (a tool could receive empty strings)
- String length limits (an arg could be arbitrarily long)
- Format constraints (e.g., `bundleId` should match `b\d+` pattern)

### Implementation

**Step 1**: Extend `TOOL_ARG_SCHEMAS` in `tool-registry.ts` to include per-arg constraints:

```typescript
// Current
export const TOOL_ARG_SCHEMAS: Record<string, string[]> = {
  check_balance: ['userId'],
  purchase_bundle: ['userId', 'bundleId'],
  // ...
};

// New — add validation metadata per arg
export interface ToolArgSchema {
  required: boolean;
  maxLength: number;
  pattern?: RegExp; // optional format constraint
}

export const TOOL_ARG_SCHEMAS: Record<string, Record<string, ToolArgSchema>> = {
  check_balance: {
    userId: { required: true, maxLength: 64 },
  },
  purchase_bundle: {
    userId: { required: true, maxLength: 64 },
    bundleId: { required: true, maxLength: 32, pattern: /^b\d+$/ },
  },
  view_bundle_details: {
    userId: { required: true, maxLength: 64 },
    bundleId: { required: true, maxLength: 32, pattern: /^b\d+$/ },
  },
  create_ticket: {
    userId: { required: true, maxLength: 64 },
    subject: { required: true, maxLength: 200 },
    description: { required: true, maxLength: 1000 },
  },
  top_up: {
    userId: { required: true, maxLength: 64 },
    amount: { required: true, maxLength: 10, pattern: /^\d+(\.\d{1,2})?$/ },
  },
  // Tools with no args beyond userId
  list_bundles: { userId: { required: true, maxLength: 64 } },
  check_usage: { userId: { required: true, maxLength: 64 } },
  get_support: { userId: { required: true, maxLength: 64 } },
  get_account_summary: { userId: { required: true, maxLength: 64 } },
};
```

**Step 2**: Update `validateToolCallWithError` in `tool-validation.service.ts` to use the new schema:

```typescript
// After JSON.parse succeeds, validate each arg:
for (const [key, schema] of Object.entries(expectedSchema)) {
  const value = args[key];
  if (schema.required && (value === undefined || value === '')) {
    return 'Invalid tool call. Use only the allowed tools with correct arguments.';
  }
  if (typeof value === 'string' && value.length > schema.maxLength) {
    return 'Invalid tool call. Use only the allowed tools with correct arguments.';
  }
  if (schema.pattern && typeof value === 'string' && !schema.pattern.test(value)) {
    return 'Invalid tool call. Use only the allowed tools with correct arguments.';
  }
}
```

**Step 3**: Update existing tests and add new cases:
- Arg exceeding maxLength → rejected
- Missing required arg → rejected
- Pattern mismatch (e.g., `bundleId: "DROP TABLE"`) → rejected
- Valid args → accepted

### Notes
- No new dependencies needed — plain TypeScript validation
- The `ALLOWED_TOOLS` Set derived from `TOOL_ARG_SCHEMAS` keys still works
- Error messages intentionally generic (don't leak schema details to LLM)

---

## Task 2: Rate-Limit History Endpoints

**Priority**: High — unauthenticated scraping/abuse vector  
**Effort**: Minimal  
**Files**:
- `backend/src/adapters/driving/rest/history.controller.ts` (modify)
- `backend/test/history.controller.e2e-spec.ts` (extend)

### Problem

The history controller at `history.controller.ts` already has `@UseGuards(RateLimitGuard)` at the class level (line 8). **This was already applied.** No change needed.

However, the rate limit is shared with `/api/agent/chat` — a user making 10 history requests burns their chat budget. Consider whether history endpoints need a separate, more generous limit.

### Implementation (if separate limit desired)

**Option A — Shared limit (current, already working)**: No changes. The existing `RateLimitGuard` on the class covers all routes.

**Option B — Separate limit for history**: Create a `HistoryRateLimitGuard` with a higher limit (e.g., 30 req/60s) using a separate rate-limit key prefix (`history:user:${userId}`). Apply it to `HistoryController` instead.

**Recommended**: Option A is sufficient for now. Document that history shares the chat rate limit budget. Revisit if abuse is observed.

### Test

Add one e2e test verifying rate limiting on history GET:
```typescript
it('should rate-limit history requests', async () => {
  // Send 11 rapid GET /api/history/sessions requests
  // Assert 11th returns 429
});
```

---

## Task 3: Extract Sub-Agent Registration to Factory

**Priority**: Medium — reduces module complexity, improves maintainability  
**Effort**: Medium  
**Files**:
- `backend/src/app.agent-module.ts` (modify)
- `backend/src/application/sub-agents/sub-agent-registry.ts` (create)
- `backend/src/application/sub-agents/sub-agent-registry.spec.ts` (create)

### Problem

`app.agent-module.ts` is 200+ lines, with lines 90–154 being a procedural block of `supervisor.registerAgent(...)` calls for 9 tools. Adding a new tool requires editing the module file and understanding the full wiring context.

### Implementation

**Step 1**: Create `sub-agent-registry.ts` — a factory that builds and registers all sub-agents:

```typescript
// backend/src/application/sub-agents/sub-agent-registry.ts
import { SubAgentPort } from '../../domain/ports/sub-agent.port';
import { SimpleQuerySubAgent, DualQuerySubAgent, ActionSubAgent } from './generic-sub-agents';
// ... other imports

export interface SubAgentDependencies {
  balanceBff: BalanceBffPort;
  bundlesBff: BundlesBffPort;
  usageBff: UsageBffPort;
  supportBff: SupportBffPort;
  accountBff: AccountBffPort;
}

export function buildSubAgentRegistry(
  deps: SubAgentDependencies,
): Map<string, SubAgentPort> {
  const registry = new Map<string, SubAgentPort>();

  registry.set('check_balance', new SimpleQuerySubAgent(/* config */));
  registry.set('list_bundles', new SimpleQuerySubAgent(/* config */));
  registry.set('check_usage', new SimpleQuerySubAgent(/* config */));
  registry.set('get_support', new DualQuerySubAgent(/* config */));
  registry.set('get_account_summary', new SimpleQuerySubAgent(/* config */));
  registry.set('view_bundle_details', new ViewBundleDetailsSubAgent(deps.bundlesBff));
  registry.set('purchase_bundle', new PurchaseBundleSubAgent(deps.bundlesBff));
  registry.set('create_ticket', new CreateTicketSubAgent(deps.supportBff));
  registry.set('top_up', new ActionSubAgent(/* config */));

  return registry;
}
```

**Step 2**: Refactor `app.agent-module.ts` to use the factory:

```typescript
// Replace 60+ lines of registration with:
const subAgents = buildSubAgentRegistry({
  balanceBff, bundlesBff, usageBff, supportBff, accountBff,
});
for (const [toolName, agent] of subAgents) {
  supervisor.registerAgent(toolName, agent);
}
```

**Step 3**: Add unit tests for the registry:
- All 9 tools registered
- Each returns correct SubAgentPort implementation
- Missing dependency throws

### Benefits
- `app.agent-module.ts` drops to ~100 lines
- Adding a new tool = one line in the registry + the sub-agent class
- Registry is independently testable

---

## Task 4: Add Database Indexes

**Priority**: Medium — improves query performance on hot paths  
**Effort**: Small  
**Files**:
- `backend/src/infrastructure/data/migrations/006_add_indexes.ts` (create)
- `backend/src/infrastructure/data/sqlite-connection.service.ts` (modify — add migration to registry)

### Problem

Conversation queries filter by `user_id` and `deleted_at` but no indexes exist on these columns. As conversation volume grows, full table scans will degrade performance.

### Implementation

**Step 1**: Create migration file:

```typescript
// backend/src/infrastructure/data/migrations/006_add_indexes.ts
import Database from 'better-sqlite3';

export function runMigration006(db: Database.Database): void {
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

**Step 2**: Register in `sqlite-connection.service.ts`:

```typescript
const MIGRATIONS: Migration[] = [
  { id: '001_initial', up: runMigration001 },
  { id: '002_add_confirmation_screen_type', up: runMigration002 },
  { id: '003_add_bundle_detail_screen_type', up: runMigration003 },
  { id: '004_mock_telco', up: runMigration004 },
  { id: '005_add_account_screen_type', up: runMigration005 },
  { id: '006_add_indexes', up: runMigration006 },  // ← add
];
```

**Step 3**: Verify migration runs on startup (existing migration runner handles this automatically).

### Notes
- `CREATE INDEX IF NOT EXISTS` is idempotent — safe to rerun
- SQLite indexes are lightweight; no downtime needed
- Composite index `(user_id, deleted_at)` covers the most common history query pattern

---

## Task 5: LLM Retry with Exponential Backoff

**Priority**: Medium — improves resilience against transient LLM failures  
**Effort**: Medium  
**Files**:
- `backend/src/adapters/driven/llm/openai-compatible.adapter.ts` (modify)
- `backend/src/adapters/driven/llm/openai-compatible.adapter.spec.ts` (extend)
- `backend/src/domain/constants/security-constants.ts` (modify — add retry constants)

### Problem

The LLM adapter throws immediately on any error (timeout, network, HTTP 5xx). Transient failures (network blips, LLM overload) cascade to the circuit breaker unnecessarily.

### Implementation

**Step 1**: Add retry constants to `security-constants.ts`:

```typescript
export const LLM_RETRY = {
  MAX_RETRIES: 2,              // 1 initial + 2 retries = 3 total attempts
  BASE_DELAY_MS: 500,          // 500ms → 1000ms → 2000ms
  MAX_DELAY_MS: 5000,
  RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504],
} as const;
```

**Step 2**: Add retry logic in `openai-compatible.adapter.ts`:

```typescript
async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= LLM_RETRY.MAX_RETRIES; attempt++) {
    try {
      return await this.doRequest(params);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!this.isRetryable(lastError, attempt)) {
        throw lastError;
      }

      const delay = Math.min(
        LLM_RETRY.BASE_DELAY_MS * Math.pow(2, attempt),
        LLM_RETRY.MAX_DELAY_MS,
      );
      this.logger?.warn(
        { attempt: attempt + 1, delay, err: lastError.message },
        'LLM request failed, retrying',
      );
      await this.sleep(delay);
    }
  }

  throw lastError!;
}

private isRetryable(error: Error, attempt: number): boolean {
  if (attempt >= LLM_RETRY.MAX_RETRIES) return false;
  // Retry on timeout, network errors, and specific HTTP status codes
  if (error.message.includes('timed out')) return true;
  if (error.message.includes('network request failed')) return true;
  for (const code of LLM_RETRY.RETRYABLE_STATUS_CODES) {
    if (error.message.includes(`${code}`)) return true;
  }
  return false;
}

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

**Step 3**: Extract current fetch logic into `private doRequest()` method (rename, no behavior change).

**Step 4**: Add tests:
- Transient 503 → retries → succeeds on 2nd attempt
- Persistent 503 → retries exhausted → throws
- 400 Bad Request → no retry (not retryable)
- Timeout → retries → succeeds
- Verify exponential delay between retries (use jest.useFakeTimers)

### Notes
- No new dependencies — uses built-in `setTimeout`
- Retry adds at most ~7.5s (500 + 1000 + 2000 + buffer) to worst-case latency
- 429 (rate limit) included as retryable — respects LLM provider rate limits
- Circuit breaker only sees final failure after all retries exhausted

---

## Task 6: Increase Unit Test Coverage (Target 85%+)

**Priority**: Medium — current coverage is ~73%  
**Effort**: Large  
**Files**: Multiple new and extended spec files

### Coverage Gaps (from analysis)

| Gap | Current Coverage | Files to Test |
|-----|-----------------|---------------|
| Generic sub-agents | None | `generic-sub-agents.ts` |
| Purchase/ticket/detail sub-agents | Partial (account only) | `purchase-bundle-sub-agent.service.ts`, `create-ticket-sub-agent.service.ts`, `view-bundle-details-sub-agent.service.ts` |
| LLM adapter edge cases | Minimal | `openai-compatible.adapter.ts` |
| Supervisor error paths | Partial | `supervisor.service.ts` |
| History controller logic | E2E only | `history.controller.ts` |

### Implementation

**Step 1**: Create `generic-sub-agents.spec.ts`:
```
- SimpleQuerySubAgent: BFF success → returns ScreenData
- SimpleQuerySubAgent: BFF throws → propagates error
- DualQuerySubAgent: Both BFFs succeed → combined result
- DualQuerySubAgent: One BFF fails → error handling
- ActionSubAgent: Valid params → executes action
- ActionSubAgent: Missing params → validation error
- ActionSubAgent: Action fails → error screen
```

**Step 2**: Create specs for specific sub-agents (mirror `account-sub-agent.service.spec.ts` pattern):
```
- purchase-bundle: valid bundleId → success confirmation
- purchase-bundle: invalid bundleId → error
- purchase-bundle: BFF failure → error propagation
- create-ticket: valid subject+description → success
- create-ticket: missing fields → validation error
- view-bundle-details: valid bundleId → detail screen
- view-bundle-details: unknown bundleId → not found
```

**Step 3**: Extend `openai-compatible.adapter.spec.ts`:
```
- Timeout after configured ms
- Network error propagation
- HTTP 4xx → error with status
- HTTP 5xx → error with body
- Malformed JSON response → graceful handling
- Empty choices array → null content
- (After Task 5) Retry scenarios
```

**Step 4**: Extend `supervisor.service.spec.ts`:
```
- Tool validation rejects unknown tool
- Tool validation rejects extra args
- Max iterations reached → returns error
- Circuit breaker open → returns degraded response
- LLM returns no tool call → returns text response
- Concurrent requests for same user (cache behavior)
```

### Target
- Statements: 73% → 85%+
- Branches: 81% → 90%+
- Functions: 73% → 85%+

---

## Execution Order

```
Week 1:  Task 1 (schema validation) + Task 4 (indexes)
         ↳ Both are small, independent, high-impact

Week 2:  Task 5 (retry/backoff) + Task 2 (history rate-limit verification)
         ↳ Retry logic is medium effort; rate-limit is verification only

Week 3:  Task 3 (sub-agent registry refactor)
         ↳ Refactoring — best done when other changes are stable

Week 4:  Task 6 (test coverage push)
         ↳ Write tests after all code changes are complete
```

Each task is independently deployable and backward-compatible. No task depends on another.
