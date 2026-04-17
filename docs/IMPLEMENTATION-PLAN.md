# Implementation Plan: Resilience & Quality Improvements

Addresses four identified concerns: fuzzy cache threshold, degraded mode E2E tests, SSE stream errors, and hardcoded intent keywords.

---

## Phase 1: Quick Wins (Low Risk, High Value)

### 1.1 — Log SSE errors in backend controller

**File**: `backend/src/adapters/driving/rest/agent.controller.ts`

The catch block swallows exceptions silently. Add logging so production stream failures are diagnosable.

```typescript
catch (error) {
  this.logger.error('SSE stream processing failed', { error });
  res.write(`event: error\ndata: ${JSON.stringify({ message: 'Processing failed' })}\n\n`);
}
```

**Effort**: ~5 minutes. Zero risk.

---

### 1.2 — Extract hardcoded keywords into configuration

**Files**: `backend/src/domain/types/intent.ts`, `backend/src/domain/services/intent-router.service.ts`

Move keyword lists and action signals to a JSON config file loaded via `@nestjs/config`, so they can be changed without code modifications or recompilation.

- Create `backend/data/intent-keywords.json` with keyword groups and action signals
- Load via `ConfigService` in `IntentRouterService` constructor
- Keep `TelecomIntent` enum and `INTENT_TOOL_MAP` in code (these are structural, not tunable)
- Validate config shape at startup with `class-validator`

**Effort**: ~1-2 hours. Low risk — behavior unchanged, just externalized.

---

## Phase 2: Fuzzy Cache Hardening

### 2.1 — Add minimum token count guard

**File**: `backend/src/application/supervisor/intent-cache.service.ts`

Short prompts (1-2 tokens after stop word removal) are most vulnerable to false-positive Jaccard matches. Add a floor:

```typescript
findBestMatch(userId: string, prompt: string): FuzzyCacheResult | null {
  const tokenSet = this.tokenize(prompt);
  if (tokenSet.size < 2) return null;  // Too few tokens for reliable fuzzy match
  // ...
}
```

**Effort**: ~15 minutes. Very low risk.

### 2.2 — Add unit tests for Jaccard edge cases

**File**: New or existing spec alongside `intent-cache.service.ts`

Cover:
- Single-token prompts → no match
- Near-threshold prompts (0.59 vs 0.61) → correct boundary behavior
- Identical prompts → match at 0.99 confidence
- Completely disjoint prompts → no match
- Token subset scenarios (e.g., "balance" vs "check my balance")

**Effort**: ~30 minutes.

### 2.3 — Make threshold configurable

**File**: `backend/src/application/supervisor/intent-cache.service.ts`

Inject threshold via `ConfigService` instead of hardcoded `0.6`. Allows tuning in production without redeployment.

```typescript
constructor(private readonly config: ConfigService) {
  this.similarityThreshold = this.config.get<number>('INTENT_CACHE_THRESHOLD', 0.6);
}
```

**Effort**: ~20 minutes.

---

## Phase 3: Degraded Mode E2E Tests

### 3.1 — Backend integration test: circuit breaker opens after 3 failures

**File**: `backend/test/app.e2e-spec.ts`

```
Test: Send 3 requests with mocked LLM failures →
      GET /api/agent/status returns { status: 'open' } →
      4th request returns degraded response without calling LLM
```

### 3.2 — Backend integration test: half-open recovery

```
Test: Open circuit → advance time 30s →
      GET /api/agent/status returns { status: 'half_open' } →
      Send successful request → circuit closes
```

### 3.3 — Backend integration test: quick actions work during degraded mode

```
Test: Open circuit →
      POST /api/agent/chat with quick-action keyword →
      Returns valid screen (Tier 1 bypass, no LLM needed)
```

### 3.4 — Frontend E2E test: degraded banner appears

**File**: New spec in `e2e/`

```
Test: Mock /api/agent/status to return degraded →
      Assert DegradedBanner is visible →
      Assert text input is hidden →
      Assert quick-action buttons remain clickable and functional
```

### 3.5 — Frontend E2E test: recovery from degraded

```
Test: Start degraded → mock status back to healthy →
      Assert banner disappears → Assert text input returns
```

**Effort**: ~3-4 hours total for all 5 tests.

---

## Phase 4: Keyword Ambiguity & i18n Readiness

### 4.1 — Resolve keyword overlap between intents

**Problem**: `"account balance"` matches both `CHECK_BALANCE` and `ACCOUNT_SUMMARY` → ambiguous → unnecessary LLM call.

**Fix**: Add priority weights or use longest-match-wins. When multiple intents match, prefer the one with the more specific keyword hit (`"account balance"` → `"balance"` is more specific than `"account"`).

**Approach**: Score Tier 1 matches by keyword specificity (multi-word keywords rank higher). Return highest-scoring match instead of requiring exactly 1 match.

**File**: `backend/src/domain/services/intent-router.service.ts`

**Effort**: ~1-2 hours + tests.

### 4.2 — i18n-ready keyword structure (deferred)

If multi-language support is planned, restructure the config to support locale-keyed keyword groups:

```json
{
  "en": {
    "CHECK_BALANCE": ["balance", "credit", "airtime"],
    "CHECK_USAGE": ["usage", "consumption", "remaining"]
  },
  "ar": {
    "CHECK_BALANCE": ["رصيد", "رصيدي"],
    "CHECK_USAGE": ["استهلاك", "الاستخدام"]
  }
}
```

Locale detected from request header or user preference. Defer until i18n is actually needed — just ensure the config structure from 1.2 doesn't preclude it.

**Effort**: ~2-3 hours when needed.

---

## Execution Order

| Step | Task | Depends On | Effort |
|------|------|-----------|--------|
| **1.1** | Log SSE errors | — | 5 min |
| **1.2** | Externalize keywords to config | — | 1-2 hrs |
| **2.1** | Min token count guard | — | 15 min |
| **2.2** | Jaccard edge case tests | — | 30 min |
| **2.3** | Configurable threshold | 1.2 (config pattern) | 20 min |
| **3.1** | Circuit breaker E2E test | — | 45 min |
| **3.2** | Half-open recovery test | 3.1 | 30 min |
| **3.3** | Quick actions during degraded test | 3.1 | 30 min |
| **3.4** | Frontend degraded banner E2E | — | 1 hr |
| **3.5** | Frontend recovery E2E | 3.4 | 30 min |
| **4.1** | Keyword ambiguity resolution | 1.2 | 1-2 hrs |
| **4.2** | i18n structure (deferred) | 4.1 | — |

Phases 1 and 2 can run in parallel. Phase 3 is independent. Phase 4.1 builds on 1.2's config externalization.
