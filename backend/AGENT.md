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
│       └── bff/             # Mock BFF adapters for balance/bundles/usage/support
│
├── infrastructure/
│   ├── data/                # SQLite persistence
│   │   ├── sqlite-connection.service.ts  # Database connection with WAL mode
│   │   ├── sqlite-data.module.ts         # NestJS module
│   │   ├── conversation-data.mapper.ts   # Conversation CRUD operations
│   │   ├── migrations/                   # Database migrations
│   │   └── json-data.module.ts           # JSON file storage for mock data
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
- **SQLite Persistence**: Conversations persisted with soft deletes. Database stored in `backend/data/telecom.db`.
- **userId trust boundary**: The supervisor always passes `request.userId` (from session) to sub-agents, never the value parsed from LLM tool call arguments.
- **Defense-in-depth**: 6 security layers — DTO validation, prompt sanitizer, rate limiting, system prompt hardening, tool call validation, history/budget caps. All tunables centralized in `domain/constants/security-constants.ts`.
- **Tool whitelist**: Only 4 tools (`check_balance`, `list_bundles`, `check_usage`, `get_support`). The `validateToolCall()` method rejects unknown tools, unexpected args, and non-string values.
- **LLM adapter**: OpenAI-compatible (`/v1/chat/completions`). Targets llama-server at configurable URL.
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
- `conversations` — Session metadata with soft delete
- `messages` — Conversation messages (FK to conversations)
- `_migrations` — Migration tracking

### Migrations
Migrations run automatically on startup. The `001_initial` migration creates all tables and indexes.

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

## Conventions

- All API routes are prefixed with `/api` (set in `main.ts`).
- DTO validation uses `class-validator` decorators with `whitelist: true` and `forbidNonWhitelisted: true` — extra fields are rejected with 400.
- Sub-agents implement `SubAgentPort` and are registered in `app.agent-module.ts` via `SupervisorService.registerAgent()`.
- Screen types: `balance | bundles | bundleDetail | usage | support | confirmation | unknown`. Mapped from tool names via `TOOL_TO_SCREEN` constant.
- New tools require: Add entry to `TOOL_REGISTRY` in `tool-registry.ts`, implement `SubAgentPort` (or use generic classes), register in `app.agent-module.ts`.
- Conversation persistence is automatic — every request/response pair is stored in SQLite.
