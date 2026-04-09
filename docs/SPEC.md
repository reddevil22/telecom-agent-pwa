# Spec: LLM Resilience Layer

## Objective

Reduce the telecom agent PWA's dependency on the LLM for every interaction. Today, every user message routes through the LLM for intent classification — if the LLM is slow or down, the app is non-functional. This spec adds five resilience mechanisms so the app handles 80%+ of common requests deterministically, degrades gracefully when the LLM fails, and gives users visible progress during processing.

**User stories:**

- As a user, common requests ("show balance", "check usage") respond instantly without waiting for LLM inference.
- As a user, quick-action buttons let me access core features without typing, even when the LLM is down.
- As a user, I see real-time processing steps while the system works, instead of a frozen spinner.
- As a user, if the LLM fails repeatedly, the app automatically switches to a working fallback mode rather than showing errors.

## Tech Stack

- **Backend**: NestJS, TypeScript, SQLite (unchanged)
- **State machine**: XState v5 (unchanged)
- **Frontend**: React 19, TypeScript, CSS Modules (unchanged)
- **LLM**: OpenAI-compatible API via `LlmPort` (unchanged)

## Commands

```
Install:          npm install && cd backend && npm install
Dev frontend:     npm run dev
Dev backend:      cd backend && npm run start:dev
Build frontend:   npm run build
Build backend:    cd backend && npm run build
Test backend:     cd backend && npm run test
Test E2E:         npx playwright test
Lint:             npm run lint
```

## Project Structure

```
# Backend — new/modified files
backend/src/
  domain/
    ports/
      intent-router.port.ts          # NEW — interface for intent classification
      circuit-breaker.port.ts        # NEW — interface for circuit breaker
    types/
      intent.ts                      # NEW — intent classification types
    services/
      intent-router.service.ts       # NEW — hybrid routing: keywords → fuzzy → LLM
      circuit-breaker.service.ts     # NEW — tracks LLM health, opens/closes circuit
  application/
    supervisor/
      supervisor.service.ts          # MODIFY — use IntentRouter before calling LLM
      intent-cache.service.ts        # NEW — fuzzy-matching intent cache
  adapters/
    driven/
      llm/
        openai-compatible.adapter.ts # UNCHANGED — already behind LlmPort
    driving/
      rest/
        agent.controller.ts          # MODIFY — add GET /api/agent/status endpoint
        quick-actions.controller.ts  # NEW — serves quick-action config, works without LLM

# Frontend — new/modified files
src/
  components/
    QuickActionBar/
      QuickActionBar.tsx             # NEW — persistent quick-action button bar
      QuickActionBar.module.css
    ProcessingStepper/
      ProcessingStepper.tsx          # NEW — live processing step indicator
      ProcessingStepper.module.css
    DegradedBanner/
      DegradedBanner.tsx             # NEW — banner shown when LLM is unavailable
      DegradedBanner.module.css
    AppShell/
      AppShell.tsx                   # MODIFY — integrate QuickActionBar, DegradedBanner
  services/
    agentService.ts                  # MODIFY — add SSE/streaming support
    llmStatusService.ts              # NEW — polls /api/agent/status, tracks LLM health
  machines/
    orchestratorMachine.ts           # MODIFY — add streaming events, degraded-mode state
```

## Code Style

Follow existing conventions:

```typescript
// Ports are interfaces in domain/ports/
export interface IntentRouterPort {
  classify(prompt: string, userId: string): Promise<IntentResult | null>;
}

// Services implement ports, injected via NestJS DI
@Injectable()
export class IntentRouterService implements IntentRouterPort {
  constructor(
    private readonly cache: IntentCacheService,
    private readonly llm: LlmPort,
  ) {}

  async classify(prompt: string, userId: string): Promise<IntentResult | null> {
    // 1. Try exact keyword match (existing logic, extracted)
    // 2. Try fuzzy intent cache
    // 3. Return null → caller falls through to LLM
  }
}
```

- CSS Modules with `*.module.css` — one file per component
- Named exports, no default exports
- TypeScript strict mode, no `any`
- Pino logging with structured fields, no `console.log`

## Testing Strategy

| Layer | Framework | Location | What to test |
|-------|-----------|----------|-------------|
| Backend unit | Jest | `backend/src/**/*.spec.ts` | IntentRouter classification, CircuitBreaker state transitions, IntentCache fuzzy matching, SupervisorService fallback paths |
| Backend integration | Jest | `backend/test/**/*.spec.ts` | Full request flow with LLM mocked as failing, quick-actions endpoint without LLM |
| Frontend E2E | Playwright | `e2e/**/*.spec.ts` | Quick-action buttons navigate correctly, degraded banner appears when LLM is down, processing stepper updates |

**Coverage expectations:**
- All new services must have unit tests with >80% line coverage
- Circuit breaker state transitions must be tested for all three states (closed, open, half-open)
- Intent router must be tested for each tier: exact match, fuzzy match, LLM fallback

## Boundaries

### Always do
- Run `npm run test` before committing
- Keep `LlmPort` as the interface — never import `OpenAiCompatibleLlmAdapter` directly from services
- Add structured logging with Pino for all routing decisions (which tier handled the request, cache hit/miss, circuit state changes)
- Invalidate cache on write operations (purchase, top-up, create_ticket) — follow existing pattern in `InMemoryScreenCacheAdapter`
- Preserve existing API contract (`AgentRequest` → `AgentResponse`) — new fields must be optional

### Ask first
- Adding new npm dependencies
- Changing the `AgentResponse` type (frontend consumers must be updated)
- Modifying the system prompt or tool definitions
- Changing cache TTL or rate limit values

### Never do
- Remove the LLM path entirely — it remains the fallback for ambiguous requests
- Change existing screen components or their props
- Store user prompts or PII in the intent cache
- Bypass the `PromptSanitizerPipe` or `RateLimitGuard`
- Commit without tests passing

## Intent Taxonomy

This is the canonical source of truth for intent classification. Frontend quick-action buttons, backend Tier 1 keywords, and fuzzy cache keys must all align to this taxonomy.

```typescript
// backend/src/domain/types/intent.ts

export enum TelecomIntent {
  CHECK_BALANCE    = 'check_balance',
  CHECK_USAGE      = 'check_usage',
  BROWSE_BUNDLES   = 'browse_bundles',
  VIEW_BUNDLE      = 'view_bundle',
  PURCHASE_BUNDLE  = 'purchase_bundle',
  TOP_UP           = 'top_up',
  GET_SUPPORT      = 'get_support',
  CREATE_TICKET    = 'create_ticket',
  ACCOUNT_SUMMARY  = 'account_summary',
}

export interface IntentResolution {
  intent: TelecomIntent;
  toolName: string;              // maps to TOOL_REGISTRY key
  args: Record<string, string>;  // pre-resolved arguments (userId injected by caller)
  confidence: number;            // 1.0 for Tier 1, 0.6–0.99 for Tier 2
}
```

**Intent → Tool → Required args mapping:**

| Intent | Tool Name | Required Args | Notes |
|--------|-----------|---------------|-------|
| `CHECK_BALANCE` | `check_balance` | `userId` | Tier 1 match via keywords |
| `CHECK_USAGE` | `check_usage` | `userId` | Tier 1 match via keywords |
| `BROWSE_BUNDLES` | `list_bundles` | `userId` | Tier 1 match via keywords |
| `VIEW_BUNDLE` | `view_bundle_details` | `userId`, `bundleId` | Requires entity extraction — always LLM (Tier 3) |
| `PURCHASE_BUNDLE` | `purchase_bundle` | `userId`, `bundleId` | Requires confirmation flow — always LLM (Tier 3) |
| `TOP_UP` | `top_up` | `userId`, `amount` | Requires amount extraction — always LLM (Tier 3) |
| `GET_SUPPORT` | `get_support` | `userId` | Tier 1 match via keywords |
| `CREATE_TICKET` | `create_ticket` | `userId`, `subject`, `description` | Requires extraction — always LLM (Tier 3) |
| `ACCOUNT_SUMMARY` | `get_account_summary` | `userId` | Tier 1 match via keywords |

**Tier eligibility**:
- **Tier 1 (keywords)**: `CHECK_BALANCE`, `CHECK_USAGE`, `BROWSE_BUNDLES`, `GET_SUPPORT`, `ACCOUNT_SUMMARY` — these require only `userId`, which is always available from the request context.
- **Tier 2 (fuzzy cache)**: Same five intents — no entity extraction needed, so fuzzy matching on the prompt is safe.
- **Tier 3 (LLM only)**: `VIEW_BUNDLE`, `PURCHASE_BUNDLE`, `TOP_UP`, `CREATE_TICKET` — these require extracting specific entities (`bundleId`, `amount`, `subject`/`description`) from the prompt, so they always go through the LLM regardless of keyword match.

## Cache Scope Definition

The fuzzy intent cache stores **Input pattern → Intent class only** (not resolved tool + args).

```typescript
// What the cache stores
interface FuzzyCacheEntry {
  tokenSet: Set<string>;         // tokenized input pattern
  intent: TelecomIntent;         // e.g., CHECK_BALANCE
  createdAt: number;
  lastMatchedAt: number;
}

// What the cache returns on match
interface FuzzyCacheResult {
  intent: TelecomIntent;
  confidence: number;
}
```

**Why intent-only, not intent+args:**

1. **Safety**: Tool args like `bundleId` and `amount` are request-specific. Caching them would cause stale or incorrect arguments to be reused. By caching only the intent, the `IntentRouterService` reconstructs args from context (for Tier 1 intents, the only arg is `userId`, which comes from the request).
2. **Simpler invalidation**: Only write operations (`PURCHASE_BUNDLE`, `TOP_UP`, `CREATE_TICKET`) need to invalidate the cache. If we cached args, we'd need fine-grained invalidation per arg type.
3. **Tier 3 intents never enter the cache**: `VIEW_BUNDLE`, `PURCHASE_BUNDLE`, `TOP_UP`, and `CREATE_TICKET` require entity extraction and always route through the LLM. They are excluded from the fuzzy cache entirely, so there's no risk of cached stale entities.

**Invalidation rules** (aligned with existing `InMemoryScreenCacheAdapter`):
- On `confirmation` screen type (purchase, top-up, ticket creation): invalidate all cache entries for that user
- On cache TTL expiry (5 minutes, same as screen cache): entry is evicted

## Rate Limiting for New Endpoints

The existing `RateLimitGuard` rate-limits by `sessionId` (POST) or `x-user-id`/IP (GET). New endpoints need differentiated treatment:

| Endpoint | Method | Rate Limit Strategy | Rationale |
|----------|--------|-------------------|-----------|
| `POST /api/agent/chat` | POST (existing) | Session-based, 10 req/min (unchanged) | Normal chat traffic |
| `POST /api/agent/chat` (SSE) | POST with SSE response | Session-based, 10 req/min, **plus** 1 concurrent connection per session | SSE connections are long-lived; limit concurrent streams to prevent resource exhaustion |
| `GET /api/agent/quick-actions` | GET | `Cache-Control: public, max-age=300` (5 min browser cache) | Static config, no LLM dependency. Browser cache prevents repeated hits. No server-side rate limit needed. |
| `GET /api/agent/status` | GET | IP-based, 4 req/min (1 poll per 15s) | Health polling endpoint. Tighter limit than chat since it's automated. |

**Implementation**:
- `GET /api/agent/quick-actions`: Exempt from `RateLimitGuard`. Add `Cache-Control` header in the controller. This is static data, same for all users.
- `GET /api/agent/status`: New guard or extend `RateLimitGuard` with a configurable limit. Use IP-based key (no session in GET body).
- SSE on `POST /api/agent/chat`: Track active SSE connections per session. Reject new SSE requests if a connection is already open for that session. This prevents a single user from holding multiple long-lived connections.

## Feature Breakdown

### 1. Hybrid Intent Routing

**Problem**: Every request calls the LLM, even "show my balance" which is trivially classifiable.

**Solution**: Three-tier routing in `IntentRouterService`:

```
User prompt
  │
  ├─ Tier 1: Exact keyword match → return tool + args immediately
  │            (extracted from existing INTENT_KEYWORDS in supervisor.service.ts)
  │
  ├─ Tier 2: Fuzzy intent cache → similar phrasings map to cached results
  │            (tokenized Jaccard similarity ≥ 0.6 against known prompts)
  │
  └─ Tier 3: LLM call → full ReAct loop (existing behavior)
```

**Key changes**:
- Extract `INTENT_KEYWORDS` and cache-lookup logic from `SupervisorService` into `IntentRouterService`
- `SupervisorService.processRequest()` calls `intentRouter.classify()` first; if it returns a result, execute the sub-agent directly and skip the LLM
- Tier 1 handles ~60% of traffic (exact keyword matches for the 5 single-arg intents)
- Tier 2 handles ~20% (paraphrases of known requests, same 5 intents via fuzzy cache)
- Tier 3 handles ~20% (entity-extraction intents + ambiguous/multi-intent requests)
- Tier 3-only intents (`VIEW_BUNDLE`, `PURCHASE_BUNDLE`, `TOP_UP`, `CREATE_TICKET`) bypass Tier 1/2 entirely — they are identified by requiring extracted entities per the Intent Taxonomy

**Acceptance criteria**:
- "show my balance", "check usage", "what bundles are available", "I need support", "show my account" return results without any LLM call
- Fuzzy matches like "how much credit left", "remaining data", "help me" are resolved without LLM after first LLM-assisted classification
- "buy the Value Plus bundle", "top up 20 dollars", "report a network problem" always route through LLM (entity extraction required)
- Ambiguous or multi-intent requests still route through the LLM
- All existing E2E tests pass unchanged

### 2. Progressive Enhancement (Quick Actions)

**Problem**: The only way to interact with the app is by typing messages. If the LLM is down, users are stuck.

**Solution**: Persistent quick-action button bar at the bottom of the chat view.

**UI**:
```
┌──────────────────────────────────────┐
│  Chat messages area                  │
│  ...                                 │
├──────────────────────────────────────┤
│  [💰 Balance] [📦 Bundles]           │
│  [📊 Usage]   [🎧 Support]           │
│  [👤 Account]                        │
├──────────────────────────────────────┤
│  [Type a message...]        [Send]   │
└──────────────────────────────────────┘
```

**Behavior**:
- Buttons are always visible, below the chat input area
- Tapping a button sends a synthetic prompt (e.g., "show my balance") through the normal flow
- The button triggers the hybrid router — so balance/usage/bundles/support/account work even without LLM (Tier 1 match)
- In degraded mode (circuit breaker open), the text input is disabled but quick actions remain active
- Button labels use the same icons/labels as the existing suggestion chips

**Backend**: New `GET /api/agent/quick-actions` endpoint returns the button configuration (label, icon, syntheticPrompt). This endpoint does NOT call the LLM — it reads from a static config.

**Acceptance criteria**:
- Quick-action buttons are visible on app load, before any chat interaction
- Clicking "Balance" shows the balance screen without typing
- When LLM is down, text input is disabled but quick actions still produce correct screens
- `GET /api/agent/quick-actions` returns 200 without any LLM dependency

### 3. Fuzzy Intent Cache

**Problem**: The current keyword cache only matches exact substring hits. "how much credit do I have" doesn't match the keyword "balance".

**Solution**: After the LLM successfully classifies a prompt, cache the mapping from the tokenized prompt to the resolved tool. Future similar prompts match via token-set Jaccard similarity.

**Algorithm**:
```typescript
// On LLM success: store tokenized prompt → TelecomIntent enum value
cache.store(promptTokens, TelecomIntent.CHECK_BALANCE);

// On next request: compare tokenized prompt against cached entries
const best = cache.findBestMatch(promptTokens, threshold = 0.6);
if (best) return best; // returns { intent: TelecomIntent, confidence: number }

// IntentRouterService then maps intent → toolName + args using the Intent Taxonomy
```

**Key details**:
- Cache stores **intent class only** (see Cache Scope Definition section). The `IntentRouterService` reconstructs the tool call from the `TelecomIntent` enum using the taxonomy mapping.
- Tokenization: lowercase, split on whitespace and punctuation, remove stop words
- Similarity: Jaccard coefficient on token sets, threshold 0.6 (tunable)
- Cache is per-user (same as existing `ScreenCachePort` pattern)
- Max 50 entries per user, LRU eviction
- Only Tier 1-eligible intents enter the cache (the 5 single-arg intents). Tier 3-only intents are excluded.
- Invalidated on write operations (purchase, top-up, ticket creation) — full user invalidation
- No user PII stored — only the tokenized intent pattern, not the raw prompt

**Acceptance criteria**:
- First time user says "how much credit do I have", LLM classifies it as `check_balance`
- Second time, same user says "remaining airtime on my number" → fuzzy cache matches → no LLM call
- Cache entries are invalidated when user purchases a bundle or tops up
- Unit tests verify similarity scoring with examples

### 4. Streaming Processing Steps

**Problem**: During LLM processing (which can take 1–3 seconds), the user sees a static "processing" indicator with no feedback.

**Solution**: Use Server-Sent Events (SSE) to stream processing step updates from the backend to the frontend in real-time.

**Flow**:
```
Frontend                        Backend
   │                               │
   │  POST /api/agent/chat         │
   │  (Accept: text/event-stream)  │
   │──────────────────────────────►│
   │                               │── classify intent...
   │  SSE: step "classifying"      │
   │  { status: "active" }         │
   │◄──────────────────────────────│
   │                               │── call sub-agent...
   │  SSE: step "classifying"      │
   │  { status: "done" }           │
   │◄──────────────────────────────│
   │  SSE: step "fetching_data"    │
   │  { status: "active" }         │
   │◄──────────────────────────────│
   │                               │── sub-agent returns...
   │  SSE: step "fetching_data"    │
   │  { status: "done" }           │
   │◄──────────────────────────────│
   │  SSE: final AgentResponse     │
   │◄──────────────────────────────│
   │                               │
```

**Backend changes**:
- `AgentController.chat()` detects `Accept: text/event-stream` and switches to SSE mode
- `SupervisorService` emits step events via an `EventEmitter` or callback as it progresses
- Final event is the full `AgentResponse` as JSON
- Falls back to regular JSON response if no `Accept: text/event-stream` header (backwards compatible)
- SSE connections are rate-limited to 1 concurrent connection per session (see Rate Limiting section)

**Frontend changes**:
- New `ProcessingStepper` component renders processing steps with animated transitions (pending → active → done)
- `agentService.ts` uses `EventSource` or `fetch` with streaming for SSE
- `orchestratorMachine` receives step-update events from the streaming response
- Existing non-streaming path works as fallback

**Acceptance criteria**:
- During a balance check, user sees "Understanding your request" → "Fetching account data" → "Preparing response" with animated transitions
- SSE stream works in Chrome, Firefox, Safari
- Non-SSE clients (curl, old browsers) still get a normal JSON response
- E2E test verifies step labels are visible during processing

### 5. Circuit Breaker

**Problem**: When the LLM server is down, every request attempts an LLM call, times out, and returns an error. Users see repeated failures.

**Solution**: Wrap LLM calls in a circuit breaker that tracks failures and short-circuits when the LLM is unhealthy.

**State machine**:
```
         ┌──────────┐
    ┌───►│  CLOSED  │◄──────┐
    │    │ (normal) │        │
    │    └────┬─────┘        │
    │         │ failures ≥ 3 │ successes ≥ 1
    │         │ in 60s       │
    │         ▼              │
    │    ┌──────────┐   ┌────┴─────┐
    │    │   OPEN   ├──►│HALF-OPEN │
    │    │(short-   │   │ (probe)  │
    │    │ circuit) │   └──────────┘
    │    └────┬─────┘        │
    │         │ after 30s    │ failures
    │         ▼              │
    │    ┌──────────┐        │
    │    │HALF-OPEN │────────┘
    │    │ (retry)  │
    │    └──────────┘
    └───────────────── (back to OPEN if probe fails)
```

**Parameters**:
- Failure threshold: 3 consecutive failures
- Window: 60 seconds (failures older than 60s are forgotten)
- Open duration: 30 seconds (then transitions to half-open)
- Half-open: allows 1 probe request through; success → closed, failure → open

**When circuit is open**:
- `IntentRouterService` skips Tier 3 (LLM) entirely
- Requests are served via Tier 1 (keywords) or Tier 2 (fuzzy cache)
- If neither tier matches, return a graceful degraded response with suggestions
- `GET /api/agent/status` returns `{ llm: "unavailable", mode: "degraded" }`

**When circuit is half-open**:
- One probe request is allowed through to the LLM
- If it succeeds, circuit closes and full service resumes
- If it fails, circuit reopens for another 30s

**Frontend integration**:
- `llmStatusService.ts` polls `GET /api/agent/status` every 15 seconds
- When status is `degraded`, show `DegradedBanner` component
- Banner text: "AI chat is temporarily unavailable. Use quick actions below."
- Text input is disabled in degraded mode
- When status returns to `available`, banner disappears and text input re-enables

**Acceptance criteria**:
- After 3 consecutive LLM failures, `/api/agent/status` returns `{ llm: "unavailable" }`
- In degraded mode, keyword-matchable requests still work (balance, bundles, usage, support, account)
- After 30 seconds, a probe request is sent; if LLM is back, circuit closes
- Degraded banner appears within 20 seconds of LLM becoming unavailable
- Banner disappears when LLM recovers

## Success Criteria

1. **Hybrid routing**: Requests matching a known intent via keyword or fuzzy cache are served without an LLM call. Verified by unit tests showing `IntentRouterService` returns results without invoking `LlmPort.chatCompletion`.
2. **Progressive enhancement**: Quick-action buttons are always visible and functional. Clicking "Show my balance" when the LLM is down still returns balance data via direct sub-agent execution. Verified by E2E test with LLM endpoint unreachable.
3. **Fuzzy intent cache**: Semantically similar phrasings ("how much credit do I have", "remaining airtime", "what's my balance") map to the same cache entry after first LLM resolution. Verified by unit test: first call hits LLM, second call with different phrasing hits cache.
4. **Streaming processing steps**: User sees processing step labels appear and transition (pending → active → done) in real-time during LLM calls. Verified by Playwright test asserting step state changes are visible.
5. **Circuit breaker**: After 3 consecutive LLM failures within 60 seconds, the circuit opens and all requests route through the deterministic path. Circuit resets to half-open after 30 seconds. Verified by unit tests for all state transitions.
6. **Degraded mode UI**: When circuit is open, a non-intrusive banner informs the user that AI chat is temporarily unavailable but quick actions still work. Verified by E2E test.
7. **Zero regressions**: All existing backend tests and E2E tests pass without modification.

## Open Questions

1. **Circuit breaker storage**: In-memory only (resets on server restart) or persisted to SQLite? In-memory is recommended — LLM health is ephemeral and a server restart should reset the circuit.
2. **SSE backwards compatibility**: Should we support both SSE and regular JSON responses from the same endpoint (via Accept header), or create a separate `/api/agent/chat/stream` endpoint? Same endpoint with content negotiation is cleaner.
