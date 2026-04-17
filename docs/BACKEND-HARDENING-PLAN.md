# Implementation Plan: Backend Hardening

Addresses 7 findings from the architecture review, ordered by severity and dependency.

---

## Phase 1: Critical Security & Reliability (no interdependencies)

### 1.1 — Add LLM request timeout

**Severity**: High — a hanging LLM server blocks the connection forever.

**File**: `backend/src/adapters/driven/llm/openai-compatible-llm.adapter.ts`

Add `AbortSignal.timeout(ms)` to the existing `fetch` call. Read timeout from injected config.

```typescript
// In fetch options (~L33):
const response = await fetch(url, {
  method: 'POST',
  headers,
  body: JSON.stringify(params),
  signal: AbortSignal.timeout(this.timeoutMs),
});
```

Catch `AbortError` / `TimeoutError` and wrap in a descriptive error so the supervisor's error handler can distinguish timeout from other failures.

**Also**:
- Add `LLM_TIMEOUT_MS` env var (default `30000`) in `backend/src/config/env.validation.ts`
- Pass timeout from config to the adapter constructor in `app.agent-module.ts`

**Effort**: ~30 minutes. **Risk**: Low — additive change, existing error paths handle thrown errors.

---

### 1.2 — Fix rate limit key to use userId

**Severity**: High — attacker rotates `sessionId` to bypass rate limiting entirely.

**File**: `backend/src/adapters/driving/rest/guards/rate-limit.guard.ts`

Change `resolveKey` (~L59-68) to read `request.userId` (set by auth middleware on every request) instead of `request.body?.sessionId`:

```typescript
private resolveKey(request: Request): string | null {
  // userId is set by auth middleware — not client-controlled
  if ((request as any).userId) {
    return `user:${(request as any).userId}`;
  }
  return request.ip ? `ip:${request.ip}` : null;
}
```

**Effort**: ~15 minutes. **Risk**: Very low — single method change, same Map structure.

---

## Phase 2: Correctness Fixes

### 2.1 — Separate LLM vs sub-agent error paths in circuit breaker

**Severity**: Medium — a BFF/DB error currently trips the circuit breaker, incorrectly marking the LLM as unavailable.

**File**: `backend/src/application/supervisor/supervisor.service.ts`

Currently, the top-level catch in `processRequest` (~L179) calls `handleError` which always calls `circuitBreaker.recordFailure()`. Both LLM failures and sub-agent failures hit this path.

**Fix**: Wrap `executeSubAgent` (~L414) in its own try/catch inside `handleToolCall`. Sub-agent errors return an error `AgentResponse` without calling `recordFailure`. Only errors from `callLlm` (~L296) propagate to the top-level catch where `recordFailure` is called.

```typescript
// In handleToolCall, around the executeSubAgent call:
try {
  const result = await this.executeSubAgent(toolCall, subAgent, request);
  // ... existing primary result handling
} catch (subAgentError) {
  this.logger?.error({ err: subAgentError, tool: toolName }, 'Sub-agent execution failed');
  // Return error response WITHOUT tripping circuit breaker
  return this.buildErrorResponse('Service temporarily unavailable. Please try again.');
}
```

**Effort**: ~30 minutes. **Risk**: Low — narrows the error path, doesn't change the happy path.

**Tests**: Update backend e2e to verify a sub-agent error does NOT open the circuit.

---

### 2.2 — Add userId filter to getConversation

**Severity**: Medium — any user can read any conversation by guessing the sessionId.

**File**: `backend/src/infrastructure/data/conversation-data.mapper.ts`

Change the `getConversationBySession` prepared statement (~L28-30) to require userId:

```sql
SELECT * FROM conversations WHERE session_id = ? AND user_id = ? AND deleted_at IS NULL
```

Update `getConversation(sessionId)` signature to `getConversation(sessionId, userId)`. Update callers:
- `SupervisorService.initializeConversation` — already has `request.userId`
- `HistoryController.getSession` — already has `req.userId` from auth middleware

**Also**: Update `ConversationStoragePort` interface in `domain/ports/conversation-storage.port.ts` to add the `userId` parameter.

**Effort**: ~30 minutes. **Risk**: Low — additive WHERE clause. Existing tests use matching userId/sessionId pairs.

---

## Phase 3: Architecture Cleanup

### 3.1 — Extract IntentCachePort to fix domain boundary violation

**Severity**: Medium — domain layer imports from application layer.

**Files**:
- Create `backend/src/domain/ports/intent-cache.port.ts`
- Modify `backend/src/domain/services/intent-router.service.ts`
- Modify `backend/src/app.agent-module.ts`

Extract the two methods called on `IntentCacheService` into a port interface:

```typescript
// domain/ports/intent-cache.port.ts
import { TelecomIntent } from '../types/intent';

export interface IntentCachePort {
  findBestMatch(userId: string, prompt: string): { intent: TelecomIntent; confidence: number } | null;
  store(userId: string, prompt: string, intent: TelecomIntent): void;
}
```

- Add `INTENT_CACHE_PORT` Symbol to `domain/tokens.ts`
- Change `IntentRouterService` constructor to accept `IntentCachePort` instead of `IntentCacheService`
- Have `IntentCacheService` implement `IntentCachePort`
- Wire via token in `app.agent-module.ts`

**Effort**: ~30 minutes. **Risk**: Low — no behavior change, just interface extraction.

---

### 3.2 — Remove dead code from supervisor

**Severity**: Low — ~30 lines of unreachable logic adding complexity.

**File**: `backend/src/application/supervisor/supervisor.service.ts`

Remove:
- `collectedResults` field from `IterationContext` (~L29)
- `updatePrimaryResult` method body — inline the primary-result assignment directly in `handleToolCall`
- `supplementary` parameter from `buildResponse` — always `[]`
- The `supplementaryResults` spread in `buildResponse` (~L600)

**Effort**: ~20 minutes. **Risk**: Very low — removing provably dead code.

---

## Phase 4: Bounded Resource Growth

### 4.1 — Add global eviction to intent cache

**Severity**: Medium — memory grows without bound across users.

**File**: `backend/src/application/supervisor/intent-cache.service.ts`

Add a periodic cleanup timer (like the rate-limit guard pattern) and a max-users cap:

```typescript
private static readonly MAX_USERS = 1000;
private static readonly CLEANUP_INTERVAL_MS = 120_000; // 2 min

constructor(...) {
  this.cleanupTimer = setInterval(() => this.evictExpiredUsers(), IntentCacheService.CLEANUP_INTERVAL_MS);
}

private evictExpiredUsers(): void {
  const now = Date.now();
  for (const [userId, entries] of this.entries) {
    // Remove all expired entries
    const alive = entries.filter(e => now - e.createdAt < IntentCacheService.TTL_MS);
    if (alive.length === 0) {
      this.entries.delete(userId);
    } else {
      this.entries.set(userId, alive);
    }
  }
}
```

Implement `OnModuleDestroy` to clear the timer.

If `entries.size > MAX_USERS` after a `store()`, delete the user with the oldest `lastMatchedAt`.

**Effort**: ~30 minutes. **Risk**: Low — additive, doesn't change match/store logic.

---

### 4.2 — Add global eviction to screen cache

**Severity**: Medium — same unbounded growth issue.

**File**: `backend/src/infrastructure/cache/in-memory-screen-cache.adapter.ts`

Same pattern as 4.1: periodic cleanup timer removes entries older than TTL, max entries cap (e.g., 500).

**Effort**: ~20 minutes. **Risk**: Low.

---

## Phase 5: Defense Hardening (optional, low severity)

### 5.1 — Harden prompt sanitizer against Unicode evasion

**Severity**: Low — current patterns only match ASCII.

**File**: `backend/src/adapters/driving/rest/pipes/prompt-sanitizer.pipe.ts`

Add Unicode normalization (NFKC) before regex matching. This collapses fullwidth characters, compatibility forms, and some homoglyphs to their ASCII equivalents:

```typescript
const normalized = prompt.normalize('NFKC');
// Then run existing regex patterns against `normalized`
```

This handles fullwidth Latin (`ｉｇｎｏｒｅ` → `ignore`), superscripts, and compatibility characters. It won't catch Cyrillic homoglyphs, but those require a dedicated confusable-detection library — diminishing returns for this use case since the LLM system prompt is the primary defense.

**Effort**: ~15 minutes. **Risk**: Very low — normalization is non-destructive for normal text.

---

### 5.2 — Validate conversation message role as enum

**Severity**: Low — `role` field accepts any string.

**File**: `backend/src/adapters/driving/rest/dto/agent-request.dto.ts`

Replace `@IsString()` on the `role` field with `@IsIn(['user', 'agent'])`.

**Effort**: ~5 minutes. **Risk**: None.

---

## Execution Order

| Step | Task | Depends On | Effort |
|------|------|-----------|--------|
| **1.1** | LLM request timeout | — | 30 min |
| **1.2** | Fix rate limit key | — | 15 min |
| **2.1** | Separate LLM/sub-agent error paths | — | 30 min |
| **2.2** | userId filter on getConversation | — | 30 min |
| **3.1** | Extract IntentCachePort | — | 30 min |
| **3.2** | Remove supervisor dead code | — | 20 min |
| **4.1** | Global intent cache eviction | — | 30 min |
| **4.2** | Global screen cache eviction | 4.1 (pattern) | 20 min |
| **5.1** | Unicode normalization in sanitizer | — | 15 min |
| **5.2** | Validate role enum in DTO | — | 5 min |

All phases are independent. Within phases, items are independent unless noted.
Total estimated effort: ~3.5 hours.
