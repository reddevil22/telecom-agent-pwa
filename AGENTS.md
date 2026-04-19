# Project Guidelines

## Overview

Telecom Agent PWA — an AI-powered telecom customer service app with a React 19 frontend and NestJS backend. The backend orchestrates LLM-powered agents via a three-tier intent routing system with circuit breaker resilience.

## Tech Stack

- **Frontend**: React 19 + TypeScript (strict) + Vite 8 + XState v5 + CSS Modules
- **Backend**: NestJS 11 + TypeScript (strict) + SQLite (better-sqlite3) + Pino logging
- **LLM**: OpenAI-compatible API. GLM-5.1 used during development. Configurable via `LLM_*` / `DASHSCOPE_*` env vars.
- **Testing**: Jest (backend unit + e2e), Playwright (frontend e2e)
- **Styling**: CSS Modules with design tokens (`theme/tokens.css`). DM Sans (body), DM Serif Display (headings). No CSS-in-JS.

## Architecture

### Backend — Hexagonal (Ports & Adapters)

Domain never imports from application or adapters. All external dependencies injected via ports (interfaces) in `domain/ports/` and wired in `app.agent-module.ts`.

```
backend/src/
├── domain/                  # Pure business logic — zero framework deps
│   ├── constants/           # tool-registry.ts, security-constants.ts, processing-steps.ts
│   ├── ports/               # LlmPort, SubAgentPort, BffPorts, ConversationStoragePort, IntentRouterPort, CircuitBreakerPort
│   ├── services/            # IntentRouterService (three-tier), CircuitBreakerService (state machine)
│   ├── tokens.ts            # DI injection tokens (Symbols)
│   └── types/               # agent.ts, domain.ts, intent.ts (TelecomIntent enum, Tier1Intent type)
│
├── application/             # Use-case orchestration
│   ├── supervisor/          # SupervisorService — hybrid routing + LLM tool dispatch
│   │   ├── supervisor.service.ts   # Main orchestrator (intent router → screen cache → circuit breaker → LLM)
│   │   ├── intent-cache.service.ts # Fuzzy Jaccard similarity cache (per-user, 50-entry LRU, 5-min TTL)
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
│   ├── driving/rest/        # Inbound HTTP API
│   │   ├── agent.controller.ts     # POST /api/agent/chat, /api/agent/chat/stream; GET /api/agent/status, /api/agent/quick-actions
│   │   ├── history.controller.ts   # GET/DELETE /api/history/*
│   │   ├── llm-health.controller.ts # GET /api/health/llm
│   │   ├── dto/                    # AgentRequestDto (class-validator)
│   │   ├── guards/                 # RateLimitGuard (10 req/60s per authenticated user, fallback to source IP)
│   │   └── pipes/                  # PromptSanitizerPipe (injection patterns, control chars)
│   └── driven/              # Outbound
│       ├── llm/             # OpenAI-compatible adapter
│       └── bff/             # BFF adapters → MockTelcoService
│
├── infrastructure/
│   ├── cache/               # In-memory screen cache (5-min TTL)
│   ├── data/                # SQLite persistence (WAL mode, migrations 001–005)
│   ├── telco/               # MockTelcoService — stateful telco BFF simulation
│   └── llm/                 # LLM health monitoring (5s cache)
│
├── config/                  # ConfigModule, env validation, intent-routing config loader
├── app.agent-module.ts      # Wires ports, adapters, sub-agents, IntentRouter, CircuitBreaker
├── app.module.ts            # Root: ConfigModule + AgentModule + SqliteDataModule (+ global interceptor/filter providers)
└── main.ts                  # Bootstrap: ValidationPipe (whitelist+forbid), CORS (routes are explicitly /api/* at controller level)
```

### Frontend — React + XState

```
src/
├── components/
│   ├── AppShell/           # Main layout with header, degraded banner, content
│   ├── ChatBubble/         # User/agent message bubbles
│   ├── DegradedBanner/     # Warning banner when LLM unavailable
│   ├── ProcessingIndicator/ # Loading animation with step indicators
│   ├── PromptContainer/    # Input field (hidden when degraded)
│   ├── QuickActionBar/     # Persistent buttons: Balance, Bundles, Usage, Support, Account
│   ├── ScreenRenderer/     # Renders screen component based on state
│   └── SuggestionChips/    # Quick action buttons
├── machines/
│   └── orchestratorMachine.ts  # XState v5: idle → processing → rendering → error
├── screens/
│   ├── BalanceScreen/      # Account balance display
│   ├── BundlesScreen/      # Available bundles
│   ├── BundleDetailScreen/ # Bundle purchase confirmation
│   ├── UsageScreen/        # Data/voice/SMS usage
│   ├── SupportScreen/      # Tickets and FAQ
│   ├── AccountScreen/      # Full account overview
│   └── registry.ts         # Screen type → component map
├── services/
│   ├── agentService.ts     # REST + SSE streaming to backend
│   ├── llmStatusService.ts # Polls /api/agent/status every 15s
│   ├── historyService.ts   # Session persistence (localStorage + API)
│   └── userSessionService.ts # User/session context manager
├── theme/
│   ├── tokens.css          # Design tokens (colors, spacing, typography)
│   └── brands/default.css  # Brand overrides
└── types/                  # AgentRequest, AgentResponse, ScreenData, screen registry types
```

### Three-Tier Intent Routing

```
User prompt
  │
  ├─ Tier 1: Keyword match → sub-agent directly (no LLM, confidence 1.0)
  │   Covers: balance, usage, bundles, support, account
  │   Keywords externalized in backend/data/intent-keywords.json
  │   Multi-match resolved by lexical specificity scoring + priority tie-breaking
  │   Skips BROWSE_BUNDLES when action signals detected (buy, purchase, order, etc.)
  │
  ├─ Tier 2: Fuzzy intent cache → Jaccard similarity on token sets (≥0.6, configurable)
  │   Min 2 tokens required. Per-user, 50-entry LRU, 5-min TTL.
  │   Only caches Tier1-eligible intents (no entity-extraction intents).
  │
  └─ Tier 3: LLM ReAct loop → single tool call per request (no chaining)
      Required for: purchase, top-up, create ticket, view bundle details (entity extraction)
```

### Circuit Breaker & Degraded Mode

- 3 consecutive LLM failures → circuit opens → Tier 1/2 only
- After 30s → half-open → one probe request → close on success, reopen on failure
- `GET /api/agent/status` returns `{ llm, mode, circuitState }`
- Frontend: `DegradedBanner` appears, text input hidden, quick-action buttons still work

### Request Flow

```
POST /api/agent/chat
  → RateLimitGuard → ValidationPipe → PromptSanitizerPipe
  → SupervisorService.processRequest()
      1. IntentRouterService (Tier 1 → Tier 2 → Tier 3)
      2. Screen cache check (userId + screenType)
      3. Circuit breaker gate — if open, return degraded response
      4. LLM ReAct loop (up to 3 iterations):
         → LlmPort.chatCompletion() with tool definitions
         → validateToolCall() against ALLOWED_TOOLS whitelist
         → ToolResolver → SubAgentPort.handle(userId)
         → Return immediately after first successful tool call
      5. Store response (SQLite) → return AgentResponse
```

### API Endpoints

| Endpoint                   | Method | Purpose                                      |
| -------------------------- | ------ | -------------------------------------------- |
| `/api/agent/chat`          | POST   | Process prompt, return AgentResponse         |
| `/api/agent/chat/stream`   | POST   | SSE streaming (step + result + error events) |
| `/api/agent/status`        | GET    | LLM availability and circuit state           |
| `/api/agent/quick-actions` | GET    | Quick-action button config (cached 5 min)    |
| `/api/history/sessions`    | GET    | List user's conversation sessions            |
| `/api/history/session/:id` | GET    | Get specific conversation                    |
| `/api/history/session/:id` | DELETE | Soft-delete a conversation                   |
| `/api/health/llm`          | GET    | LLM server health check                      |

### Security Layers

6 layers of defense-in-depth: DTO validation, prompt sanitizer pipe, rate limiting (10 req/60s), system prompt hardening, tool call whitelist validation, history/budget caps. Tunables in `domain/constants/security-constants.ts`.

### Database

SQLite at `backend/data/telecom.db` (auto-created). Tables: `conversations`, `messages`, `telco_accounts`, `telco_bundles_catalog`, `telco_subscriptions`, `telco_usage_records`, `telco_tickets`, `telco_faq`.

## Build and Test

```bash
# Frontend
npm install              # install frontend deps
npm run dev              # Vite dev server on 127.0.0.1:5173
npm run build            # tsc -b && vite build
npm run lint             # eslint

# Backend (run from backend/)
npm install
npm test                 # Jest unit tests
npm run test:e2e         # Jest integration tests (test/jest-e2e.json)
npm run start:dev        # NestJS watch mode

# E2E (Playwright — run from root)
npx playwright test                                    # all specs
npx playwright test e2e/degraded-mode.spec.ts          # degraded mode
npx playwright test --config=playwright.demo.config.ts # demo recording
```

## Environment Variables

| Variable                       | Default                     | Purpose                          |
| ------------------------------ | --------------------------- | -------------------------------- |
| `LLM_BASE_URL`                 | `http://localhost:8080/v1`  | LLM API base URL                 |
| `LLM_API_KEY`                  | `''`                        | API key (empty for local)        |
| `LLM_MODEL_NAME`               | `meta-llama/Llama-3-70b`    | Model identifier                 |
| `LLM_TEMPERATURE`              | `0.1`                       | Sampling temperature             |
| `LLM_MAX_TOKENS`               | `1024`                      | Max response tokens              |
| `INTENT_CACHE_THRESHOLD`       | `0.6`                       | Fuzzy cache similarity threshold |
| `INTENT_KEYWORDS_PATH`         | `data/intent-keywords.json` | External keyword config path     |
| `PORT`                         | `3001`                      | HTTP server port                 |
| `NODE_ENV`                     | `development`               | Runtime environment              |
| `LOG_LEVEL`                    | `info`                      | Pino log level                   |
| `TELCO_SIMULATION_INTERVAL_MS` | `60000`                     | Mock telco usage tick interval   |

## Conventions

- **TypeScript strict mode** in both frontend and backend. No `any` unless unavoidable.
- **Commit messages**: Conventional Commits format — `feat(scope):`, `fix(scope):`, `test(scope):`.
- **Backend DI tokens**: Use Symbols from `domain/tokens.ts`, never string tokens.
- **Intent keywords**: Edit `backend/data/intent-keywords.json` for Tier 1 routing changes — not code. Config validated at startup with `class-validator`.
- **Environment variables**: Declared and validated in `backend/src/config/env.validation.ts`. Add new env vars there with defaults.
- **Screen types**: `TelecomIntent` enum in `domain/types/intent.ts` is the canonical intent taxonomy. `Tier1Intent` is the subset routable without LLM.
- **Frontend services**: Singleton services in `src/services/` — no React context providers. Subscribe via callbacks.
- **Test isolation**: Backend e2e tests use unique `userId` per test and `mockReset()` between scenarios to prevent cache pollution.
- **Playwright baseURL**: Uses `127.0.0.1:5173` (not `localhost`) to avoid port conflicts.
- **Domain boundary**: Domain layer has zero NestJS imports. Ports are plain TypeScript interfaces.
- **Single screen per request**: Supervisor returns after first successful tool call. No tool chaining.
- **userId trust boundary**: Supervisor always passes `request.userId` to sub-agents, never LLM-parsed values.
- **Tool whitelist**: 9 tools registered (`check_balance`, `list_bundles`, `check_usage`, `get_support`, `view_bundle_details`, `purchase_bundle`, `top_up`, `create_ticket`, `get_account_summary`).
