# Backend Architecture Reference

## Hexagonal Architecture

The backend follows a **ports & adapters** (hexagonal) architecture with a strict dependency rule:

```
domain → application → adapters → infrastructure
  (inner)                        (outer)
```

- **Domain** never imports from application, adapters, or infrastructure
- **Application** imports from domain only
- **Adapters** implement domain ports (interfaces)
- **Infrastructure** provides concrete implementations (SQLite, cache, mock telco)

The entire system is wired together in `app.agent-module.ts` using NestJS dependency injection with Symbols as injection tokens (`domain/tokens.ts`).

---

## Layer Map

```
src/
│
├── domain/                          ← Pure business logic, zero framework deps
│   ├── constants/
│   │   ├── tool-registry.ts             9 tools: name, screenType, args, descriptions, LLM parameters
│   │   ├── security-constants.ts         Rate limits, max iterations, char budgets, blocked patterns
│   │   └── processing-steps.ts           Standardized step labels and error messages
│   ├── ports/
│   │   ├── llm.port.ts                  LlmPort — chatCompletion()
│   │   ├── sub-agent.port.ts            SubAgentPort — handle(userId, params) → screenData
│   │   ├── bff-ports.ts                 BalanceBffPort, BundlesBffPort, UsageBffPort, SupportBffPort
│   │   ├── conversation-storage.port.ts  ConversationStoragePort — CRUD + soft delete
│   │   ├── screen-cache.port.ts         ScreenCachePort — get/set/invalidate per userId + screenType
│   │   ├── intent-router.port.ts        IntentRouterPort — classify(prompt, userId)
│   │   └── circuit-breaker.port.ts      CircuitBreakerPort — state/isAvailable/record*
│   ├── services/
│   │   ├── intent-router.service.ts     Three-tier routing (keywords → fuzzy cache → null)
│   │   └── circuit-breaker.service.ts   CLOSED → OPEN → HALF_OPEN state machine
│   ├── tokens.ts                       Symbol-based DI injection tokens
│   └── types/
│       ├── agent.ts                    AgentRequest, AgentResponse, ScreenData, ScreenType, ProcessingStep
│       ├── domain.ts                   Balance, Bundle, UsageEntry, SupportTicket, AccountSummary types
│       └── intent.ts                   TelecomIntent enum, TIER1_INTENTS, INTENT_TOOL_MAP, INTENT_KEYWORDS
│
├── application/                      ← Use-case orchestration (depends on domain only)
│   ├── supervisor/
│   │   ├── supervisor.service.ts       Main orchestrator — intent router → cache → circuit breaker → LLM
│   │   ├── intent-cache.service.ts     Fuzzy token matching with Jaccard similarity (per-user LRU)
│   │   ├── system-prompt.ts            LLM system prompt — all 9 tools, purchase flow rules, security
│   │   ├── tool-definitions.ts         Auto-generated LLM function definitions from tool-registry
│   │   └── tool-resolver.ts            Map<toolName, SubAgentPort> — resolves tool calls to handlers
│   └── sub-agents/
│       ├── generic-sub-agents.ts       SimpleQuerySubAgent, DualQuerySubAgent, ActionSubAgent
│       ├── purchase-bundle-sub-agent.service.ts   Balance check → deduct → subscription creation
│       ├── create-ticket-sub-agent.service.ts     Subject + description extraction → create ticket
│       └── view-bundle-details-sub-agent.service.ts  Bundle details + affordability check
│
├── adapters/                         ← Inbound (driving) and outbound (driven) adapters
│   ├── driving/rest/                  Inbound — HTTP API
│   │   ├── agent.controller.ts        POST /chat, /chat/stream · GET /status, /quick-actions
│   │   ├── quick-actions.config.ts    Static 5-button config (balance, bundles, usage, support, account)
│   │   ├── history.controller.ts      GET /sessions, /session/:id · DELETE /session/:id
│   │   ├── llm-health.controller.ts   GET /health/llm
│   │   ├── dto/
│   │   │   └── agent-request.dto.ts   class-validator: prompt (max 1000), sessionId, userId, history
│   │   ├── guards/
│   │   │   └── rate-limit.guard.ts    10 req / 60s sliding window per sessionId
│   │   ├── pipes/
│   │   │   └── prompt-sanitizer.pipe.ts  Control chars, injection patterns (≤15ms overhead)
│   │   └── middleware/
│   │       ├── auth.middleware.ts     Sets userId header (placeholder for real auth)
│   │       └── correlation-id.middleware.ts  Request tracking ID
│   └── driven/                        Outbound — external systems
│       ├── llm/
│       │   ├── llm.module.ts          NestJS module providing LLM_PORT
│       │   └── openai-compatible.adapter.ts  POST /v1/chat/completions (llama-server or DashScope)
│       └── bff/                        Backend-for-Frontend adapters
│           ├── balance/                MockTelcoBalanceBffAdapter → getBalance(), topUp()
│           ├── bundles/                MockTelcoBundlesBffAdapter → getBundles(), purchaseBundle()
│           ├── usage/                  MockTelcoUsageBffAdapter → getUsage()
│           └── support/                MockTelcoSupportBffAdapter → getTickets(), getFaq(), createTicket()
│
├── infrastructure/                   ← Concrete implementations
│   ├── cache/
│   │   ├── screen-cache.module.ts     NestJS module providing SCREEN_CACHE_PORT
│   │   └── in-memory-screen-cache.adapter.ts  Map<userId, Map<screenType, response>> with 5-min TTL
│   ├── data/
│   │   ├── sqlite-data.module.ts      NestJS module providing CONVERSATION_STORAGE_PORT
│   │   ├── sqlite-connection.service.ts   better-sqlite3 with WAL mode, auto-migrations
│   │   ├── conversation-data.mapper.ts    Implements ConversationStoragePort against SQLite
│   │   └── migrations/
│   │       ├── 001_initial.ts         conversations + messages tables
│   │       ├── 002_add_screen_type.ts screen_type column on messages
│   │       ├── 003_soft_delete.ts     deleted_at column on conversations
│   │       ├── 004_mock_telco.ts      telco_* tables + seed data for user-1
│   │       └── 005_add_account_screen_type.ts  'account' to screen_type CHECK
│   ├── telco/
│   │   ├── mock-telco.module.ts       NestJS module providing MockTelcoService
│   │   └── mock-telco.service.ts      Stateful telco simulation (see below)
│   └── llm/
│       ├── llm-health.module.ts       NestJS module
│       └── llm-health.service.ts      GET /health with 5-second cache, localhost → 127.0.0.1
│
├── config/                           ← Environment configuration
│   ├── config.module.ts              ConfigModule.forRoot() with validation
│   └── env.validation.ts            Joi schema for all env vars with defaults
│
├── app.agent-module.ts              ← DI wiring: creates SupervisorService + registers all 9 sub-agents
├── app.module.ts                    ← Root module: Logger + Config + Agent + SqliteData + LlmHealth
└── main.ts                          ← Bootstrap: ValidationPipe (whitelist+forbid), CORS, /api prefix
```

---

## The Request Lifecycle

Every chat request follows this pipeline:

```
HTTP Request
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│  1. NestJS Pipeline                                          │
│     RateLimitGuard → ValidationPipe → PromptSanitizerPipe    │
│     (10 req/60s)    (class-validator)  (injection blocking)  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  2. SupervisorService.processRequest()                       │
│                                                               │
│     ┌─── IntentRouterService ──────────────────────────┐    │
│     │  Tier 1: keyword match? → sub-agent directly      │    │
│     │  Tier 2: fuzzy cache hit? → sub-agent directly    │    │
│     │  Tier 3: null (fall through to LLM)               │    │
│     └──────────────────────────────────────────────────┘    │
│                       │                                       │
│              ┌─── Screen Cache ───┐                          │
│              │  Cached response?  │                          │
│              └────────┬───────────┘                          │
│                       │                                       │
│              ┌─── Circuit Breaker ─┐                         │
│              │  Open? → degraded   │                         │
│              └────────┬────────────┘                         │
│                       │                                       │
│              ┌─── LLM ReAct Loop ──────────────────┐        │
│              │  1. Send prompt + tool definitions   │        │
│              │  2. LLM responds with tool call      │        │
│              │  3. Validate tool (whitelist + args)  │        │
│              │  4. Execute sub-agent                 │        │
│              │  5. Return immediately (single screen)│        │
│              │     On error: retry (up to 3 iters)  │        │
│              └──────────────────────────────────────┘        │
│                       │                                       │
│              ┌─── Post-processing ────────────────┐         │
│              │  • Cache intent mapping (Tier 2)   │         │
│              │  • Store in screen cache            │         │
│              │  • Persist to SQLite                │         │
│              └─────────────────────────────────────┘         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
              AgentResponse { screenType, screenData, replyText, suggestions }
```

### Single-Screen Guarantee

The supervisor returns after the **first successful tool call**. The only exception is invalid tool calls, which trigger retries (up to `SUPERVISOR_MAX_ITERATIONS`). The LLM never chains multiple tool calls — each user interaction produces exactly one screen.

---

## Dependency Injection Wiring

Everything is wired in `app.agent-module.ts` using a factory provider:

```
NestJS Injector
    │
    ├── LLM_PORT          ← OpenAiCompatibleLlmAdapter (llm.module.ts)
    ├── BALANCE_BFF_PORT   ← MockTelcoBalanceBffAdapter (balance-bff.module.ts)
    ├── BUNDLES_BFF_PORT   ← MockTelcoBundlesBffAdapter (bundles-bff.module.ts)
    ├── USAGE_BFF_PORT     ← MockTelcoUsageBffAdapter (usage-bff.module.ts)
    ├── SUPPORT_BFF_PORT   ← MockTelcoSupportBffAdapter (support-bff.module.ts)
    ├── CONVERSATION_STORAGE_PORT ← ConversationDataMapper (sqlite-data.module.ts)
    ├── SCREEN_CACHE_PORT   ← InMemoryScreenCacheAdapter (screen-cache.module.ts)
    ├── ConfigService       ← @nestjs/config
    ├── PinoLogger          ← nestjs-pino
    └── MockTelcoService    ← mock-telco.module.ts
              │
              ▼
    SupervisorService factory
        ├── IntentCacheService (new, in-memory)
        ├── IntentRouterService(intentCache)
        ├── CircuitBreakerService(new, injectable clock)
        │
        └── 9 registered sub-agents:
            ├── check_balance       → SimpleQuerySubAgent(balanceBff.getBalance)
            ├── list_bundles        → SimpleQuerySubAgent(bundlesBff.getBundles)
            ├── check_usage         → SimpleQuerySubAgent(usageBff.getUsage)
            ├── get_account_summary → SimpleQuerySubAgent(telcoService.getAccountSummary)
            ├── get_support         → DualQuerySubAgent(supportBff.getTickets, supportBff.getFaq)
            ├── view_bundle_details → ViewBundleDetailsSubAgent(bundlesBff, balanceBff)
            ├── purchase_bundle     → PurchaseBundleSubAgent(bundlesBff)
            ├── create_ticket       → CreateTicketSubAgent(supportBff)
            └── top_up              → ActionSubAgent(balanceBff.topUp)
```

---

## Sub-Agent Types

Three generic patterns handle most tools. Complex flows get dedicated classes.

### SimpleQuerySubAgent
Single BFF call → screen. Used for read-only operations.
```
userId → BFF call → transformResult(screenData)
```
Tools: `check_balance`, `list_bundles`, `check_usage`, `get_account_summary`

### DualQuerySubAgent
Two parallel BFF calls → merged screen. Used for support (tickets + FAQ).
```
userId → [BFF call 1, BFF call 2] → transformResult(data1, data2)
```
Tools: `get_support`

### ActionSubAgent
Validate params → execute action → confirmation screen. Used for mutations.
```
params → validateParams() → executeAction(userId, params) → confirmation screen
```
Tools: `top_up`

### Dedicated Sub-Agents
Complex flows that don't fit the generic patterns:

| Sub-Agent | Why Dedicated |
|-----------|---------------|
| `PurchaseBundleSubAgent` | Balance check → deduct → subscription creation, multi-step |
| `ViewBundleDetailsSubAgent` | Needs both bundle details AND current balance for affordability check |
| `CreateTicketSubAgent` | Extracts subject + description from LLM params, then creates ticket |

---

## Tool Registry

`domain/constants/tool-registry.ts` is the single source of truth for all 9 tools. From it, everything is auto-generated:

```typescript
TOOL_REGISTRY = {
  check_balance:       { screenType: 'balance',      allowedArgs: ['userId'], ... },
  list_bundles:        { screenType: 'bundles',      allowedArgs: ['userId'], ... },
  view_bundle_details: { screenType: 'bundleDetail', allowedArgs: ['userId', 'bundleId'], ... },
  check_usage:         { screenType: 'usage',        allowedArgs: ['userId'], ... },
  get_support:         { screenType: 'support',      allowedArgs: ['userId'], ... },
  purchase_bundle:     { screenType: 'confirmation', allowedArgs: ['userId', 'bundleId'], ... },
  top_up:              { screenType: 'confirmation', allowedArgs: ['userId', 'amount'], ... },
  create_ticket:       { screenType: 'support',      allowedArgs: ['userId', 'subject', 'description'], ... },
  get_account_summary: { screenType: 'account',      allowedArgs: ['userId'], ... },
}
```

Auto-derived constants:
- `ALLOWED_TOOLS` — Set of valid tool names (security whitelist)
- `TOOL_TO_SCREEN` — Map tool name → screen type
- `TOOL_ARG_SCHEMAS` — Map tool name → allowed argument keys
- `REPLY_MAP` — Map screen type → default reply text
- `SUGGESTION_MAP` — Map screen type → suggestion chips
- `TOOL_DEFINITIONS` — LLM function calling definitions (name, description, JSON schema)

**Adding a new tool**: Add one entry to `TOOL_REGISTRY`. Everything else is derived.

---

## Intent Router

`domain/services/intent-router.service.ts` implements three-tier classification:

```
classify(prompt, userId)
    │
    ├── Tier 1: Keyword Match
    │   Lowercases prompt, checks against INTENT_KEYWORDS
    │   Skips BROWSE_BUNDLES if action signals present (buy, purchase, order, etc.)
    │   Returns only on unambiguous single-match
    │   Confidence: 1.0
    │
    ├── Tier 2: Fuzzy Cache
    │   Tokenizes prompt (removes stop words)
    │   Jaccard similarity against cached token sets (threshold ≥ 0.6)
    │   Per-user, 50-entry LRU, 5-minute TTL
    │   Confidence: 0.6–0.99
    │
    └── null → falls through to LLM (Tier 3)
```

Only Tier 1-eligible intents (requiring only `userId`) are cached in the fuzzy cache. Entity-extraction intents (`purchase_bundle`, `top_up`, `create_ticket`) are never cached because the LLM must extract parameters from the prompt.

---

## Circuit Breaker

`domain/services/circuit-breaker.service.ts` protects against LLM outages:

```
CLOSED (normal)
    │  3 consecutive failures
    ▼
OPEN (degraded)
    │  30 seconds pass
    ▼
HALF_OPEN (probe)
    │  success → CLOSED
    │  failure → OPEN
```

- Uses injectable clock (`() => Date.now()`) for deterministic testing
- In-memory state (resets on server restart)
- When OPEN, `SupervisorService` returns a degraded response with quick-action suggestions

---

## Screen Cache

`infrastructure/cache/in-memory-screen-cache.adapter.ts` stores recent responses:

- Key: `(userId, screenType)`
- TTL: 5 minutes
- Cacheable types: `balance`, `bundles`, `usage`, `support`, `account`
- `confirmation` responses invalidate all cached screens for that user
- Lookup requires an unambiguous keyword match in the prompt

---

## MockTelcoService

`infrastructure/telco/mock-telco.service.ts` simulates a real telecom OSS/BSS:

### Data Model

```
telco_accounts          telco_bundles_catalog
┌──────────────┐       ┌──────────────────────┐
│ userId (PK)  │       │ id (PK): b1–b5       │
│ msisdn       │       │ name, price, data_gb  │
│ name         │       │ minutes, sms          │
│ balance      │       │ validity_days         │
│ billing_*    │       │ category              │
│ status       │       └──────────────────────┘
└──────┬───────┘                │
       │                        │ purchase
       │    telco_subscriptions │
       │   ┌────────────────────┤
       │   │ subscriptionId     │
       ├───│ userId (FK)        │
       │   │ bundleId (FK)      │
       │   │ data/voice/SMS     │
       │   │ used + total       │
       │   │ activatedAt        │
       │   │ expiresAt          │
       │   └────────────────────┘
       │
       │    telco_usage_records
       │   ┌────────────────────┐
       ├───│ userId (FK)        │
       │   │ type (data/voice)  │
       │   │ amount, direction  │
       │   │ timestamp          │
       │   └────────────────────┘
       │
       │    telco_tickets
       │   ┌────────────────────┐
       ├───│ userId (FK)        │
       │   │ subject, desc      │
       │   │ status             │
       │   │ createdAt, updated │
       │   └────────────────────┘
       │
       │    telco_faq
       │   ┌────────────────────┐
       └───│ question, answer   │
           └────────────────────┘
```

### Time-Aware Simulation

On every read, if `TELCO_SIMULATION_INTERVAL_MS` (default 60s) has elapsed since the last tick:
1. Randomly increments data/voice/SMS usage on active subscriptions
2. Expires subscriptions past their `expiresAt`
3. Progresses ticket statuses: `open → in_progress → resolved`

### Bundle Purchase Flow

```
purchaseBundle(userId, bundleId)
    1. Lookup bundle in catalog → 404 if not found
    2. Check user balance → error if insufficient
    3. Deduct price from account balance
    4. Create subscription row with full allowances
    5. Record usage event
    6. Return { success, balance, bundle }
```

### Account Summary Aggregation

```
getAccountSummary(userId)
    1. Fetch account profile
    2. Fetch active subscriptions JOINed with bundle catalog
    3. Fetch recent transactions (purchases + top-ups + ticket events, sorted desc, capped at 5)
    4. Fetch open (non-resolved) tickets
    5. Return { profile, activeSubscriptions, recentTransactions, openTickets }
```

---

## Security Layers

Six layers of defense, all tunables in `domain/constants/security-constants.ts`:

| Layer | Mechanism | Location |
|-------|-----------|----------|
| 1. DTO validation | class-validator, whitelist+forbidNonWhitelisted | `adapters/driving/rest/dto/` |
| 2. Prompt sanitizer | Control chars, blocked injection patterns | `adapters/driving/rest/pipes/` |
| 3. Rate limiting | 10 req / 60s sliding window per sessionId | `adapters/driving/rest/guards/` |
| 4. System prompt hardening | Security rules, tool restrictions | `application/supervisor/system-prompt.ts` |
| 5. Tool call validation | Whitelist + allowed args + type checks | `supervisor.service.ts` → `validateToolCallWithError()` |
| 6. History/budget caps | Max 20 history entries, total char budget | `supervisor.service.ts` → `buildInitialMessages()` |

### userId Trust Boundary

The supervisor **always** passes `request.userId` to sub-agents, never the `userId` parsed from LLM tool call arguments. This prevents the LLM from impersonating other users.

---

## Database

SQLite via `better-sqlite3` with WAL mode. Auto-migrations on startup.

**Location**: `backend/data/telecom.db`

**5 migrations**: Initial schema → screen type column → soft delete → telco tables + seed → account screen type

**Seed data** (migration 004):
- user-1: $50 balance, active Starter Pack (partially consumed), 2 support tickets, 5 FAQs
- 5 bundles: Starter Pack ($9.99), Value Plus ($19.99), Unlimited Pro ($39.99), Weekend Pass ($4.99), Travel Roaming ($14.99)

Delete `telecom.db` to force a fresh seed on next startup.

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_BASE_URL` | `http://localhost:8080/v1` | LLM API endpoint |
| `LLM_API_KEY` | `''` | API key (empty for local llama-server) |
| `LLM_MODEL_NAME` | `meta-llama/Llama-3-70b` | Model name (local) |
| `LLM_PROVIDER` | `local` | `local` or `dashscope` |
| `LLM_TEMPERATURE` | `0.1` | Sampling temperature |
| `LLM_MAX_TOKENS` | `1024` | Max response tokens |
| `DASHSCOPE_API_KEY` | — | Alibaba Cloud DashScope key |
| `DASHSCOPE_BASE_URL` | — | DashScope endpoint |
| `DASHSCOPE_MODEL_NAME` | — | DashScope model |
| `PORT` | `3001` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment |
| `LOG_LEVEL` | `info` | Pino log level |
| `TELCO_SIMULATION_INTERVAL_MS` | `60000` | Usage simulation tick interval |

---

## Test Structure

174 tests across 17 suites, run via Jest:

```
backend/src/**/*.spec.ts
│
├── domain/
│   ├── types/intent.spec.ts                     7 tests — taxonomy consistency, tier eligibility
│   ├── services/intent-router.service.spec.ts   28 tests — keyword match, fuzzy cache, action signals
│   └── services/circuit-breaker.service.spec.ts 13 tests — state transitions, injectable clock
│
├── application/
│   ├── supervisor/supervisor.service.spec.ts    29 tests — routing, validation, caching, errors
│   └── supervisor/tool-resolver.spec.ts          6 tests — register/resolve
│
├── adapters/
│   ├── driving/rest/dto/agent-request.dto.spec.ts    4 tests — DTO validation
│   ├── driving/rest/pipes/prompt-sanitizer.pipe.spec.ts  8 tests — injection blocking
│   └── driving/rest/guards/rate-limit.guard.spec.ts   8 tests — sliding window
│
└── infrastructure/
    ├── data/conversation-data.mapper.spec.ts          22 tests — CRUD, soft delete
    ├── cache/in-memory-screen-cache.adapter.spec.ts    8 tests — TTL, invalidation
    ├── telco/mock-telco.service.spec.ts               35 tests — balance, bundles, purchase, usage
    └── llm/llm-health.service.spec.ts                  6 tests — health checks
```

Run: `cd backend && npm test`
