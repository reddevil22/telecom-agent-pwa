# Implementation Plan: Codebase Improvements

Addresses architectural, resilience, UX/accessibility, and production-readiness findings from the April 2026 codebase analysis. Organized into four phases by risk and dependency order.

---

## Phase 1: Structural Cleanup (Low Risk, High Impact)

### 1.1 — Modularize Sub-Agent Registration

**Problem**: `app.agent-module.ts` contains 260+ lines of inline agent factory registrations in a single provider function. Adding a new tool requires editing this file and understanding 13 existing registrations.

**Files**:
- `backend/src/app.agent-module.ts` (refactor)
- `backend/src/application/sub-agents/billing-agents.provider.ts` (new)
- `backend/src/application/sub-agents/support-agents.provider.ts` (new)
- `backend/src/application/sub-agents/account-agents.provider.ts` (new)
- `backend/src/application/sub-agents/bundle-agents.provider.ts` (new)

**Approach**:
1. Create per-domain provider factory files that export NestJS `FactoryProvider[]` arrays
2. Each factory receives the relevant BFF ports and returns registered sub-agent instances
3. `app.agent-module.ts` imports and spreads these provider arrays into its `providers` list
4. Supervisor's `registerAgent()` calls move into the factory functions

**Example structure**:
```typescript
// billing-agents.provider.ts
export function createBillingAgents(balanceBff, topUpBff): SubAgentRegistration[] {
  return [
    { toolName: 'check_balance', agent: new SimpleQuerySubAgent(balanceBff.getBalance, { ... }) },
    { toolName: 'top_up', agent: new ActionSubAgent({ ... }) },
  ];
}
```

**Groupings**:
| Module | Tools |
|--------|-------|
| Billing | `check_balance`, `top_up` |
| Bundles | `list_bundles`, `view_bundle_details`, `purchase_bundle` |
| Support | `get_support`, `create_ticket` |
| Account | `get_account_summary`, `check_usage` |

**Effort**: ~2 hours. Low risk — no behavioral change, pure structural refactor.

**Verification**: All existing backend E2E tests pass unchanged.

---

### 1.2 — Unify Intent Keywords (Remove Client-Side Duplicate)

**Problem**: `src/services/intentClassifier.ts` maintains a separate keyword map from `backend/data/intent-keywords.json`. These will inevitably drift.

**Files**:
- `src/services/intentClassifier.ts` (refactor or remove)
- `src/machines/orchestratorMachine.ts` (if classifier is used in routing)

**Approach**:
1. Determine if `intentClassifier.ts` is actually consumed anywhere in the frontend flow
2. If used only for optimistic UI hints: fetch keyword config from `/api/agent/quick-actions` (already cached 5 min) and derive client-side classification from that response
3. If not consumed: delete the file and its imports (dead code)
4. If consumed for offline fallback: keep a minimal version that maps quick-action labels to screen types, derived from the backend response at startup

**Effort**: ~1 hour. Low risk.

**Verification**: Playwright E2E tests pass; no regressions in intent routing.

---

### 1.3 — Granular Cache Invalidation

**Problem**: After any confirmation screen, `invalidateAll(userId)` nukes the entire user cache. A bundle purchase should only invalidate balance and bundles caches.

**File**: `backend/src/application/supervisor/supervisor.service.ts`

**Approach**:
1. Define an invalidation map in a constant:
   ```typescript
   const CACHE_INVALIDATION_MAP: Record<string, ScreenType[]> = {
     purchase_bundle: ['balance', 'bundles'],
     top_up: ['balance'],
     create_ticket: ['support'],
   };
   ```
2. After a successful tool call that produces a confirmation screen, look up the tool name in the map
3. Call `this.cache.invalidate(userId, screenType)` for each affected type instead of `invalidateAll()`
4. Add `invalidate(userId: string, screenType: string)` to the cache port interface if it only has `invalidateAll()`

**Effort**: ~1 hour. Low risk.

**Verification**: Add unit test that confirms unrelated screens remain cached after a purchase.

---

## Phase 2: Test & Resilience Hardening (Medium Risk)

### 2.1 — Add SSE Streaming Integration Tests

**Problem**: The primary UX path (`/chat/stream`) has no integration tests. Only `/chat` is covered.

**File**: `backend/test/app.e2e-spec.ts` (extend)

**Test scenarios**:
1. **Happy path**: POST `/chat/stream` → receives `event: step` events with processing labels → `event: result` with final `AgentResponse`
2. **Error during processing**: Mock LLM to throw → receives `event: error` with message
3. **Tier 1 routed intent via stream**: Keyword match still works through stream endpoint (no LLM step events, immediate result)
4. **Circuit breaker open via stream**: Returns degraded response through SSE
5. **Client disconnect (AbortSignal)**: Verify server-side cleanup when client closes connection

**Approach**:
- Use `supertest` or raw HTTP to read SSE event stream
- Parse `event:` and `data:` lines from response body
- Assert event ordering: step events arrive before result event

**Effort**: ~3 hours. Medium risk — requires SSE parsing in test harness.

---

### 2.2 — Circuit Breaker Awareness of Sub-Agent Failures

**Problem**: Sub-agent failures (BFF/database layer down) don't increment the circuit breaker. The LLM keeps calling the same failing sub-agent.

**Files**:
- `backend/src/application/supervisor/supervisor.service.ts`
- `backend/src/domain/services/circuit-breaker.service.ts`

**Approach**:
1. Add a separate failure counter for sub-agent errors (distinct from LLM failures)
2. Define a `SUB_AGENT_FAILURE_THRESHOLD` (e.g., 5 consecutive failures across any sub-agent)
3. When threshold exceeded, enter a `sub_agent_degraded` mode that returns cached screens or degraded responses for affected tools
4. Do NOT trip the main circuit breaker (LLM is still healthy) — instead, disable specific tools

**Alternative (simpler)**: Track per-tool failure counts. After 3 consecutive failures for a specific tool, temporarily exclude it from the tool definitions sent to the LLM and return a "temporarily unavailable" response for that tool's direct Tier 1 route.

**Effort**: ~3 hours. Medium risk — new state to manage.

**Verification**: New E2E test: mock BFF to fail 5 times → verify tool excluded from LLM definitions → verify Tier 1 route returns degraded.

---

### 2.3 — LLM Retry with Backoff

**Problem**: A single network blip increments the failure counter toward circuit-open. No retry logic exists.

**File**: `backend/src/adapters/driven/llm/openai-compatible-llm.adapter.ts`

**Approach**:
1. Add a single retry with 1s delay before recording failure to the circuit breaker
2. Only retry on transient errors (network timeout, 502/503/504) — not on 400/401/422
3. Use the existing `LLM_TIMEOUT_MS` for the retry attempt as well
4. Log both the initial failure and the retry attempt

```typescript
async chatCompletion(params): Promise<LlmResponse> {
  try {
    return await this.doRequest(params);
  } catch (error) {
    if (this.isTransient(error)) {
      this.logger.warn('LLM transient error, retrying once', { error });
      await delay(1000);
      return await this.doRequest(params);  // Let this throw to caller
    }
    throw error;
  }
}
```

**Effort**: ~1 hour. Low risk — transparent to callers.

---

### 2.4 — Cache Eviction and LRU Edge Case Tests

**Problem**: No tests for 50-entry LRU eviction, 1000-user cap, or TTL boundary behavior.

**Files**:
- `backend/src/application/supervisor/intent-cache.service.spec.ts` (extend)
- `backend/src/infrastructure/cache/in-memory-screen-cache.adapter.spec.ts` (extend or create)

**Test scenarios**:
- Insert 51 entries for one user → assert oldest entry evicted
- Insert entries for 1001 users → assert oldest user's cache evicted
- Insert entry, advance time 4m59s → assert still cached; advance 1s → assert evicted
- Concurrent writes to same key → assert latest wins

**Effort**: ~2 hours.

---

## Phase 3: UX, Accessibility & Production Readiness (Medium Risk)

### 3.1 — Structured Error Codes

**Problem**: All errors return generic messages. No machine-readable error codes for client-side handling, analytics, or i18n.

**Files**:
- `backend/src/domain/types/errors.ts` (new)
- `backend/src/application/supervisor/supervisor.service.ts`
- `backend/src/adapters/driving/rest/agent.controller.ts`
- `src/types/agent.ts` (extend `AgentResponse`)

**Approach**:
1. Define error code enum:
   ```typescript
   enum AgentErrorCode {
     RATE_LIMITED = 'ERR_RATE_LIMITED',
     LLM_TIMEOUT = 'ERR_LLM_TIMEOUT',
     LLM_UNAVAILABLE = 'ERR_LLM_UNAVAILABLE',
     TOOL_FAILED = 'ERR_TOOL_FAILED',
     INSUFFICIENT_BALANCE = 'ERR_INSUFFICIENT_BALANCE',
     INVALID_BUNDLE = 'ERR_INVALID_BUNDLE',
     PROMPT_BLOCKED = 'ERR_PROMPT_BLOCKED',
     MAX_ITERATIONS = 'ERR_MAX_ITERATIONS',
   }
   ```
2. Sub-agents return `{ errorCode, message }` on failure instead of throwing
3. `AgentResponse` gains optional `errorCode` field
4. Frontend can key off error codes for specific UX (e.g., retry button for timeout, different copy for insufficient balance)

**Effort**: ~3 hours.

---

### 3.2 — ARIA Live Regions for Processing Updates

**Problem**: Screen readers don't announce step progress during SSE streaming.

**Files**:
- `src/components/ProcessingIndicator/ProcessingIndicator.tsx`
- `src/components/ProcessingIndicator/ProcessingIndicator.module.css`

**Approach**:
1. Wrap the step list container in an `aria-live="polite"` region
2. Add `aria-label` to each step item with status text (e.g., "Fetching balance: complete")
3. Add a visually hidden status summary that updates on each step change (e.g., "Step 2 of 3: Querying account")
4. Use `role="status"` on the overall processing container

```tsx
<div role="status" aria-live="polite" aria-label="Processing your request">
  <span className={styles.srOnly}>{currentStepSummary}</span>
  {steps.map(step => (
    <div key={step.label} aria-label={`${step.label}: ${step.status}`}>
      {/* visual indicator */}
    </div>
  ))}
</div>
```

**Effort**: ~1 hour. Low risk.

---

### 3.3 — Lazy-Load Screens

**Problem**: All screens are eagerly imported in the registry. First load is heavier than necessary.

**Files**:
- `src/screens/registry.ts`
- `src/components/ScreenRenderer/ScreenRenderer.tsx`

**Approach**:
1. Replace static imports with `React.lazy()`:
   ```typescript
   const BalanceScreen = lazy(() => import('./BalanceScreen/BalanceScreen'));
   ```
2. Wrap `ScreenRenderer` output in `<Suspense fallback={<SkeletonScreen />}>`
3. Each screen becomes its own chunk in the Vite build

**Effort**: ~1 hour. Low risk.

**Verification**: `npm run build` produces separate chunks per screen. Playwright tests still pass.

---

### 3.4 — Input Validation on Action Forms

**Problem**: Top-up amount field and ticket creation form lack client-side validation.

**Files**:
- `src/screens/BalanceScreen/BalanceScreen.tsx`
- `src/screens/SupportScreen/SupportScreen.tsx`

**Approach**:
- Top-up: min $1, max $500, numeric only, debounce input
- Ticket subject: min 5 chars, max 100 chars
- Ticket description: min 10 chars, max 500 chars
- Show inline validation messages below fields
- Disable submit button when invalid

**Effort**: ~2 hours.

---

### 3.5 — Observability Foundation

**Problem**: No metrics for evaluating three-tier routing effectiveness, LLM costs, or cache performance.

**Files**:
- `backend/src/domain/ports/metrics.port.ts` (new)
- `backend/src/infrastructure/metrics/simple-metrics.adapter.ts` (new)
- `backend/src/application/supervisor/supervisor.service.ts` (instrument)

**Approach**:
1. Define a `MetricsPort` interface:
   ```typescript
   interface MetricsPort {
     recordIntentResolution(tier: 1 | 2 | 3, intent: string, latencyMs: number): void;
     recordLlmCall(model: string, tokensUsed: number, latencyMs: number): void;
     recordCacheHit(cacheType: 'intent' | 'screen', hit: boolean): void;
     recordToolCall(toolName: string, success: boolean, latencyMs: number): void;
     recordCircuitBreakerTransition(from: string, to: string): void;
     getSnapshot(): MetricsSnapshot;
   }
   ```
2. Implement `SimpleMetricsAdapter` — in-memory counters with `GET /api/metrics` endpoint
3. Instrument supervisor: record tier, latency, and cache hits at each routing decision point
4. Expose `GET /api/metrics` (admin-only) returning JSON snapshot

**Effort**: ~4 hours.

**Future**: Swap adapter for Prometheus/OpenTelemetry when moving to production infrastructure.

---

## Phase 4: Advanced Improvements (Higher Risk, Longer Horizon)

### 4.1 — Conversation Context Summarization

**Problem**: `TOTAL_CHARS_BUDGET` (8000 chars) truncates older messages abruptly. Multi-turn conversations lose context.

**Files**:
- `backend/src/application/supervisor/supervisor.service.ts`
- `backend/src/application/supervisor/context-manager.service.ts` (new)

**Approach**:
1. When conversation history exceeds 60% of `TOTAL_CHARS_BUDGET`, trigger summarization
2. Send older messages (beyond most recent 4) to the LLM with a "summarize this conversation so far" prompt
3. Replace older messages with a single `role: system` message containing the summary
4. Cache the summary per session to avoid re-summarizing on every request
5. Only summarize once per threshold crossing (not every request)

**Trade-offs**: Adds one LLM call per summarization. Consider doing this asynchronously after the response.

**Effort**: ~4 hours.

---

### 4.2 — Simple Authentication Flow

**Problem**: Hardcoded `userId: 'user-1'`. No multi-tenancy demonstration.

**Files**:
- `src/machines/orchestratorMachine.ts` (parameterize userId)
- `src/components/AppShell/AppShell.tsx` (user selector UI)
- `backend/src/infrastructure/telco/mock-telco.service.ts` (seed multiple users)

**Approach** (POC-appropriate — not production auth):
1. Seed 3 demo telco accounts (Alex Morgan, Jamie Chen, Sam Patel) with different balances, bundles, and usage
2. Add a user selector dropdown in the AppShell header
3. Store selected userId in localStorage
4. Pass selected userId in `x-user-id` header
5. State machine resets conversation on user switch

**Effort**: ~3 hours.

---

### 4.3 — Distributed Rate Limiting

**Problem**: In-memory rate limiting breaks horizontal scaling.

**Files**:
- `backend/src/adapters/driving/rest/guards/rate-limit.guard.ts`
- `backend/src/domain/ports/rate-limiter.port.ts` (new)

**Approach**:
1. Extract rate limiting behind a `RateLimiterPort` interface
2. Keep the in-memory adapter as default for development
3. Keep the in-memory adapter for now; defer distributed adapter work until scaling needs justify extra dependencies
4. Use sliding window counter algorithm (sorted set per user)

**Effort**: ~3 hours. Deferred until horizontal scaling is actually needed.

---

## Phase Summary

| Phase | Items | Total Effort | Risk |
|-------|-------|-------------|------|
| **1: Structural Cleanup** | 1.1–1.3 | ~4 hours | Low |
| **2: Test & Resilience** | 2.1–2.4 | ~9 hours | Medium |
| **3: UX & Production** | 3.1–3.5 | ~11 hours | Medium |
| **4: Advanced** | 4.1–4.3 | ~10 hours | Higher |

**Recommended order**: Phase 1 first (unblocks cleaner development), then Phase 2 (hardens what exists), then Phase 3 items in priority order (3.1 → 3.2 → 3.5 → 3.3 → 3.4), then Phase 4 as stretch goals.

---

## Acceptance Criteria (All Phases)

- All existing backend E2E tests pass after each change
- All existing Playwright E2E tests pass after each change
- No new `any` types introduced
- No new hardcoded magic numbers (use constants or config)
- Each phase produces a passing `npm test` and `npm run build` in both frontend and backend
