# Backend — Telecom Agent Service

NestJS backend that orchestrates an LLM-powered telecom customer service agent. Uses hexagonal (ports & adapters) architecture with a strict dependency rule: domain never imports from application or adapters.

## Architecture

```
src/
├── domain/                  # Pure business logic — zero framework deps
│   ├── constants/           # tool-registry.ts (single source of truth), security-constants.ts, processing-steps.ts
│   ├── ports/               # Interfaces: LlmPort, SubAgentPort, BffPorts, ConversationStoragePort
│   ├── tokens.ts            # DI injection tokens (Symbols)
│   └── types/               # agent.ts (request/response), domain.ts (entities)
│
├── application/             # Use-case orchestration
│   ├── supervisor/          # SupervisorService — LLM routing & tool dispatch
│   │   ├── supervisor.service.ts   # Main orchestrator (refactored into 12 focused methods)
│   │   ├── system-prompt.ts        # LLM system prompt with security rules
│   │   ├── tool-definitions.ts     # Auto-generated from tool-registry.ts
│   │   └── tool-resolver.ts        # toolName → SubAgentPort registry
│   └── sub-agents/          # Generic + specific sub-agents
│       ├── generic-sub-agents.ts   # SimpleQuerySubAgent, DualQuerySubAgent, ActionSubAgent
│       ├── purchase-bundle-sub-agent.service.ts
│       ├── create-ticket-sub-agent.service.ts
│       └── view-bundle-details-sub-agent.service.ts
│
├── adapters/
│   ├── driving/rest/        # Inbound — HTTP API
│   │   ├── agent.controller.ts     # POST /api/agent/chat
│   │   ├── history.controller.ts   # GET/DELETE /api/history/*
│   │   ├── llm-health.controller.ts # GET /api/health/llm
│   │   ├── dto/                    # AgentRequestDto with class-validator
│   │   ├── guards/                 # RateLimitGuard (10 req/60s per session)
│   │   └── pipes/                  # PromptSanitizerPipe (injection patterns, control chars)
│   └── driven/              # Outbound — external systems
│       ├── llm/             # OpenAI-compatible adapter (llama-server)
│       └── bff/             # BFF adapters delegating to MockTelcoService
│
├── infrastructure/
│   ├── data/                # SQLite persistence
│   │   ├── sqlite-connection.service.ts  # Database connection with WAL mode
│   │   ├── sqlite-data.module.ts         # NestJS module (exports SqliteConnectionService)
│   │   ├── conversation-data.mapper.ts   # Conversation CRUD operations
│   │   └── migrations/                   # 001_initial through 005_add_account_screen_type
│   ├── telco/               # Mock telco BFF simulation
│   │   ├── mock-telco.service.ts         # Stateful telco simulation (balance, bundles, usage, tickets)
│   │   └── mock-telco.module.ts          # NestJS module
│   └── llm/                 # LLM health monitoring
│       └── llm-health.service.ts         # LLM server health checks
│
├── config/                  # ConfigModule + envValidationSchema
├── app.agent-module.ts      # Wires all ports, adapters, and sub-agents via DI
├── app.module.ts            # Root: ConfigModule + AgentModule + SqliteDataModule + JsonDataModule
└── main.ts                  # Bootstrap: ValidationPipe (whitelist+forbid), CORS, /api prefix
```

## Request Flow

### Agent Chat Flow
```
POST /api/agent/chat
  → RateLimitGuard (sessionId sliding window)
  → ValidationPipe (class-validator DTO checks)
  → PromptSanitizerPipe (control chars, blocked injection patterns)
  → SupervisorService.processRequest()
      → Get or create conversation (SQLite)
      → Store user message (SQLite)
      → buildMessages() — caps history to 10, wraps userId in <user_context>, 8000-char budget
      → LlmPort.chatCompletion() — sends to llama-server with tool definitions
      → validateToolCall() — verifies tool name + args against ALLOWED_TOOLS whitelist
      → ToolResolver → SubAgentPort.handle(userId) — always uses request.userId, never LLM args
      → Store agent response (SQLite)
      → Returns AgentResponse with screenType + screenData
```

### History Flow
```
GET /api/history/sessions?userId=user-1
  → RateLimitGuard
  → ConversationStoragePort.getConversationsByUser()
  → Returns [{ sessionId, messageCount, updatedAt }]

GET /api/history/session/:id
  → RateLimitGuard
  → ConversationStoragePort.getConversation()
  → Returns full conversation with messages

DELETE /api/history/session/:id
  → RateLimitGuard
  → ConversationStoragePort.softDeleteConversation()
  → Returns { deleted: true }
```

### LLM Health Flow
```
GET /api/health/llm
  → LlmHealthService.checkHealth()
  → Calls llama-server /health endpoint
  → Caches result for 5 seconds
  → Returns { status, url, responseTime, error? }
```

## Key Design Decisions

- **Hexagonal Architecture**: Domain layer has zero NestJS imports. Ports are plain TypeScript interfaces.
- **Mock Telco BFF Service**: A stateful `MockTelcoService` backed by SQLite simulates a real telecom OSS/BSS. It manages subscriber accounts, bundle catalog, active subscriptions, CDR-style usage records, and support tickets — all persisted in `telco_*` tables alongside the conversation data. Lazy time-aware simulation increments usage and progresses ticket statuses on every read (configurable via `TELCO_SIMULATION_INTERVAL_MS`).
- **SQLite Persistence**: Conversations persisted with soft deletes. Telco state persisted alongside in the same database. Stored in `backend/data/telecom.db`.
- **userId trust boundary**: The supervisor always passes `request.userId` (from session) to sub-agents, never the value parsed from LLM tool call arguments.
- **Defense-in-depth**: 6 security layers — DTO validation, prompt sanitizer, rate limiting, system prompt hardening, tool call validation, history/budget caps. All tunables centralized in `domain/constants/security-constants.ts`.
- **Tool whitelist**: 9 tools registered (`check_balance`, `list_bundles`, `check_usage`, `get_support`, `view_bundle_details`, `purchase_bundle`, `top_up`, `create_ticket`, `get_account_summary`). The `validateToolCall()` method rejects unknown tools, unexpected args, and non-string values.
- **LLM adapter**: OpenAI-compatible (`/v1/chat/completions`). Supports local llama-server and DashScope (Alibaba Cloud). The LLM used during development was **GLM-5.1**.
- **LLM health monitoring**: Background health checks with 5-second cache. Converts `localhost` to `127.0.0.1` automatically.
- **Soft deletes**: Conversations are soft-deleted (deleted_at timestamp) for audit trail.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_BASE_URL` | `http://localhost:8080/v1` | LLM API base URL |
| `LLM_API_KEY` | `''` | API key (empty for local) |
| `LLM_MODEL_NAME` | `meta-llama/Llama-3-70b` | Model identifier |
| `LLM_TEMPERATURE` | `0.1` | Sampling temperature |
| `LLM_MAX_TOKENS` | `1024` | Max response tokens |
| `PORT` | `3001` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment |
| `LOG_LEVEL` | `info` | Pino log level |
| `TELCO_SIMULATION_INTERVAL_MS` | `60000` | How often mock telco simulates usage ticks |

## Commands

```bash
npm run start:dev     # Dev server with watch
npm run build         # Compile to dist/
npm run test          # Unit tests (Jest)
npm run test:e2e      # E2E tests
npm run lint          # ESLint
```

## Database

SQLite database created automatically at `backend/data/telecom.db`.

### Tables

**Conversation tables (migrations 001–003):**
- `conversations` — Session metadata with soft delete
- `messages` — Conversation messages (FK to conversations)
- `_migrations` — Migration tracking

**Mock Telco tables (migration 004):**
- `telco_accounts` — Subscriber accounts (userId, msisdn, name, balance, billing cycle, status)
- `telco_bundles_catalog` — Static bundle catalog (id, name, price, data_gb, minutes, sms, validity_days, category)
- `telco_subscriptions` — Active bundles owned by users (allowances + consumed counters, status, activation/expiry dates)
- `telco_usage_records` — CDR-like usage events (type, amount, direction, timestamp)
- `telco_tickets` — Support tickets with lifecycle (status progression: open → in_progress → resolved)
- `telco_faq` — Static FAQ entries

### Migrations
Migrations run automatically on startup. Migration `004_mock_telco` creates the telco tables and seeds default data (user-1 with $50 balance, 5 bundles, 1 active subscription, 2 tickets, 5 FAQs). Migration `005_add_account_screen_type` adds `'account'` to the `screen_type` CHECK constraint on the `messages` table.

## Refactoring Highlights

### Generic Sub-Agent Factory (2025-01)
Created reusable sub-agent classes in `generic-sub-agents.ts`:
- **SimpleQuerySubAgent**: For single BFF call operations (balance, bundles, usage)
- **DualQuerySubAgent**: For parallel BFF calls (support = tickets + FAQ)
- **ActionSubAgent**: For confirmation-based operations with validation (top-up)

**Impact**: Reduced 5 individual sub-agent files to 3 generic classes + 3 complex ones. Adding a new simple query now requires ~5 lines instead of 25.

### Tool Registry Consolidation (2025-01)
Created `tool-registry.ts` as single source of truth:
- Tool metadata (name, screenType, allowedArgs, replyText, suggestions, description, parameters)
- Auto-generates: `ALLOWED_TOOLS`, `TOOL_TO_SCREEN`, `TOOL_ARG_SCHEMAS`, `REPLY_MAP`, `SUGGESTION_MAP`, `TOOL_DEFINITIONS`

**Impact**: Adding a new tool requires updating 1 file instead of 4.

### Supervisor Service Refactoring (2025-01)
Split 373-line `processRequest()` into 12 focused methods:
- `initializeConversation()`, `executeIteration()`, `callLlm()`
- `handleNoToolCall()`, `handleToolCall()`, `validateToolCallWithError()`
- `executeSubAgent()`, `updatePrimaryResult()`, `feedResultBackToLlm()`
- `handleMaxIterationsReached()`, `handleError()`, `buildUnknownResponse()`

**Impact**: Each method has single responsibility, easier to test and understand.

### Standardized Constants (2025-01)
Created `processing-steps.ts` with:
- `ProcessingStepLabels` — Standardized step names across all sub-agents
- `ErrorMessages` — Consistent error messages
- `ConfirmationTitles` — Standardized confirmation dialog titles

### Mock Telco BFF Service (2026-04)

Replaced the static `JsonDataStore`/`File*BffAdapter` stack with a stateful `MockTelcoService` backed by SQLite.

**What it does:**
- Manages subscriber accounts with real balance deductions and top-ups
- Maintains a bundle catalog with purchase flow (balance check → subscription creation → deduction)
- Tracks usage per active subscription with CDR-style records
- Runs lazy time-aware simulation: on every read, if `TELCO_SIMULATION_INTERVAL_MS` (default 60s) has elapsed, randomly increments data/voice/SMS usage, expires stale bundles, and progresses ticket statuses (open → in_progress → resolved)
- Persists all state across restarts in `telco_*` tables

**Architecture fit:**
New `MockTelco*BffAdapter` classes implement the same `BalanceBffPort`, `BundlesBffPort`, `UsageBffPort`, `SupportBffPort` interfaces, so sub-agents and the supervisor are completely unchanged. The `JsonDataModule` was removed from `app.module.ts`; old file/mock adapters remain in the codebase but are unwired.

**Seed data (user-1):**
- $50 balance, billing cycle = current month
- 5 bundles (Starter Pack, Value Plus, Unlimited Pro, Weekend Pass, Travel Roaming)
- 1 active Starter Pack subscription (partially consumed: ~0.9/2 GB, 49/100 min, 13/50 SMS)
- 2 support tickets (1 open, 1 in_progress)
- 5 FAQ entries

**Files:** `infrastructure/telco/mock-telco.service.ts`, `infrastructure/telco/mock-telco.module.ts`, 4 `MockTelco*BffAdapter` files, migration `004_mock_telco.ts`.

## Conventions

- All API routes are prefixed with `/api` (set in `main.ts`).
- DTO validation uses `class-validator` decorators with `whitelist: true` and `forbidNonWhitelisted: true` — extra fields are rejected with 400.
- Sub-agents implement `SubAgentPort` and are registered in `app.agent-module.ts` via `SupervisorService.registerAgent()`.
- Screen types: `balance | bundles | bundleDetail | usage | support | confirmation | account | unknown`. Mapped from tool names via `TOOL_TO_SCREEN` constant.
- New tools require: Add entry to `TOOL_REGISTRY` in `tool-registry.ts`, implement `SubAgentPort` (or use generic classes), register in `app.agent-module.ts`.
- Conversation persistence is automatic — every request/response pair is stored in SQLite.
- BFF adapters delegate to `MockTelcoService` which owns all telco state. The old `JsonDataStore`/`File*BffAdapter` implementations are retained in the codebase but no longer wired.
- Mock telco data is seeded by migration `004_mock_telco`. Delete `backend/data/telecom.db` to force a fresh seed.

### Account Dashboard (2026-04)

Added a `get_account_summary` tool that aggregates all user data into a single screen:
- **Profile**: Account name, MSISDN, plan, status, balance, billing cycle
- **Active subscriptions**: JOINed with bundle catalog, includes data/voice/SMS usage bars
- **Recent transactions**: Combined from subscriptions (purchases), tickets, and top-ups, sorted by timestamp desc, capped at 5
- **Open tickets**: Non-resolved support tickets with status

Registered as a `SimpleQuerySubAgent` in `app.agent-module.ts`, delegating to `MockTelcoService.getAccountSummary()`. Migration `005_add_account_screen_type` adds `'account'` to the `messages.screen_type` CHECK constraint.

**Files:** `infrastructure/telco/mock-telco.service.ts` (new `getAccountSummary` method), `domain/constants/tool-registry.ts` (new tool entry), `domain/types/agent.ts` (AccountScreenData type), `domain/types/domain.ts` (AccountProfile, ActiveSubscription, TransactionEntry, OpenTicket interfaces), `infrastructure/data/migrations/005_add_account_screen_type.ts`.
