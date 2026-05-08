# Telecom Agent PWA

> AI-powered telecom customer service PWA built with React 19, NestJS, and XState v5

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
[![NestJS](https://img.shields.io/badge/NestJS-11-blue.svg)](https://nestjs.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Open Source](https://img.shields.io/badge/Open%20Source-Yes-brightgreen.svg)](https://github.com/reddevil22/telecom-agent-pwa)

## Overview

Telecom Agent PWA is an AI-powered customer service application. Users type natural-language requests ("show my balance", "what bundles are available?") and get rich screen responses — balances, bundle catalogs, usage charts, support tickets. It runs as a PWA (installable, offline-capable).

## Tech Stack

| Layer         | Technology                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| Frontend      | React 19, TypeScript (strict), Vite 8, XState v5, CSS Modules                                          |
| Backend       | NestJS 11, TypeScript (strict), SQLite (better-sqlite3), Pino logging                                  |
| LLM           | OpenAI-compatible API. Configurable via `LLM_*` / `DASHSCOPE_*` env vars.                               |
| E2E Tests     | Playwright                                                                                              |
| Backend Tests | Jest + Supertest                                                                                        |

## Quick Start

### Prerequisites

- Node.js 18+
- An OpenAI-compatible LLM server (e.g., llama-server) running on port 8080

### Frontend

```bash
npm install
cp .env.example .env
npm run dev        # http://127.0.0.1:5173
npm run build      # Production build
```

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run start:dev  # http://localhost:3001
```

### Running Tests

```bash
# Frontend E2E
npx playwright test

# Backend unit tests
cd backend && npm test
```

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
│   │   ├── supervisor.service.ts   # Main orchestrator (intent router → screen cache → circuit breaker → ReAct loop)
│   │   ├── system-prompt.ts        # LLM system prompt with security rules
│   │   ├── tool-definitions.ts     # Auto-generated from tool-registry.ts
│   │   └── tool-resolver.ts        # toolName → SubAgentPort registry
│   └── sub-agents/          # Generic + specific sub-agents
│       ├── generic-sub-agents.ts   # SimpleQuerySubAgent, DualQuerySubAgent, ActionSubAgent
│       ├── purchase-bundle-sub-agent.service.ts
│       ├── create-ticket-sub-agent.service.ts
│       ├── view-bundle-details-sub-agent.service.ts
│       └── data-gift-sub-agent.service.ts
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
│           └── data-gift/   # DataGiftBffAdapter
│
├── infrastructure/
│   ├── cache/               # In-memory screen cache (5-min TTL)
│   ├── data/                # SQLite persistence (WAL mode, migrations 001–007)
│   ├── telco/               # MockTelcoService — stateful telco BFF simulation
│   └── llm/                 # LLM health monitoring (5s cache)
│
├── config/                  # ConfigModule, env validation, intent-routing config loader
├── app.agent-module.ts      # Wires ports, adapters, sub-agents, IntentRouter, CircuitBreaker
├── app.module.ts            # Root: ConfigModule + AgentModule + SqliteDataModule (+ global interceptor/filter providers)
└── main.ts                  # Bootstrap: ValidationPipe (whitelist+forbid), CORS
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
│   │   └── TopUpPanel.tsx  # Inline top-up when balance insufficient
│   ├── UsageScreen/        # Data/voice/SMS usage
│   ├── SupportScreen/      # Tickets and FAQ
│   ├── AccountScreen/      # Full account overview
│   ├── DataGiftScreen/     # Data gifting review & confirmation
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

### Intent Routing (Deterministic Pre-Checks + LLM)

```
User prompt
  │
  ├─ Share-data pre-check: if share/gift/send/transfer data signal + amount +
  │  recipient are present, route directly to `share_data` (deterministic, no LLM)
  │
  ├─ Top-up pre-check: if top-up/recharge/add-credit signal + amount is present,
  │  route directly to `top_up` (deterministic, no LLM)
  │
  ├─ Purchase pre-check: if purchase signal + concrete bundle ID is present,
  │  route directly to `purchase_bundle` (deterministic, no LLM)
  │
  └─ LLM tool dispatch → bounded 2-tool ReAct loop
      Bounded second tool call when:
        (A) comparison signal ("compare", "vs") + first tool was view_bundle_details
        (B) first tool returned pending confirmation
        (C) compound signal ("and", "also") + first tool was check_balance/check_usage
      Both results surfaced via AgentResponse.supplementaryResults for comparison UI
      Required for: purchase, create ticket, view bundle details,
      and prompts without extractable entities
```

### Tool → SubAgent Registry

Tool definitions are auto-generated from `backend/src/domain/constants/tool-registry.ts` via `tool-definitions.ts`. The `ToolResolver` maps tool names to `SubAgentPort` instances registered by provider factories.

| Tool Name | SubAgent Class | Provider | Route | Notes |
| --------- | -------------- | -------- | ----- | ----- |
| `check_balance` | `SimpleQuerySubAgent` | `billing-agents.provider.ts` | Keyword | |
| `top_up` | `ActionSubAgent<TopUpParams>` | `billing-agents.provider.ts` | Pre-check | Amount extracted by IntentRouter before routing |
| `check_usage` | `SimpleQuerySubAgent` | `account-agents.provider.ts` | Keyword | |
| `get_account_summary` | `SimpleQuerySubAgent` | `account-agents.provider.ts` | Keyword | |
| `list_bundles` | `SimpleQuerySubAgent` | `bundle-agents.provider.ts` | Keyword | |
| `view_bundle_details` | `ViewBundleDetailsSubAgent` | `bundle-agents.provider.ts` | LLM | LLM-guided; first call in bundle comparison; requires entity extraction |
| `purchase_bundle` | `PurchaseBundleSubAgent` | `bundle-agents.provider.ts` | Pre-check or LLM | Pre-check when bundle ID present; LLM-guided otherwise |
| `get_support` | `DualQuerySubAgent` | `support-agents.provider.ts` | Keyword | |
| `create_ticket` | `CreateTicketSubAgent` | `support-agents.provider.ts` | LLM | LLM-guided; requires subject + description |
| `share_data` | `DataGiftSubAgent` | `data-gift-agents.provider.ts` | Pre-check | Deterministic routing when recipient + amount present |

**Routing flow:**
```
IntentRouterService.classify() → IntentResolution (intent + toolName + args)
  └→ SupervisorService calls ToolResolver.resolve(toolName) → SubAgentPort.handle(userId, args)
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
      1. Share-data / Top-up / Purchase pre-check (deterministic routing, no LLM)
      2. Screen cache check (userId + screenType)
      3. Circuit breaker gate — if open, return degraded response
      4. LLM tool dispatch loop (up to 3 iterations, bounded 2-tool ReAct):
         → LlmPort.chatCompletion() with tool definitions
         → validateToolCall() against ALLOWED_TOOLS whitelist
         → ToolResolver → SubAgentPort.handle(userId, args)
         → Second tool call if comparison/compound/pending-confirmation conditions met
         → Both results returned via supplementaryResults[] when applicable
      5. Store response (SQLite) → return AgentResponse
```

### API Endpoints

| Endpoint                   | Method | Purpose                                      |
| -------------------------- | ------ | -------------------------------------------- |
| `/api/agent/chat`          | POST   | Process prompt, return AgentResponse         |
| `/api/agent/chat/stream`   | POST   | SSE streaming (step + result + error events) |
| `/api/agent/status`        | GET    | LLM availability and circuit state            |
| `/api/agent/quick-actions` | GET    | Quick-action button config (cached 5 min)    |
| `/api/history/sessions`    | GET    | List user's conversation sessions             |
| `/api/history/session/:id` | GET    | Get specific conversation                    |
| `/api/history/session/:id` | DELETE | Soft-delete a conversation                   |
| `/api/health/llm`          | GET    | LLM server health check                      |

### Security Layers

6 layers of defense-in-depth: DTO validation, prompt sanitizer pipe, rate limiting (10 req/60s), system prompt hardening, tool call whitelist validation, history/budget caps. Tunables in `domain/constants/security-constants.ts`.

### Database

SQLite at `backend/data/telecom.db` (auto-created). Tables: `conversations`, `messages`, `telco_accounts`, `telco_bundles_catalog`, `telco_subscriptions`, `telco_usage_records`, `telco_tickets`, `telco_faq`. Migration 007 adds `dataGift` to the `messages.screen_type` CHECK constraint.

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
- **Bounded 2-tool ReAct loop**: The supervisor may call a second tool within the same request when conditions warrant it (bundle comparisons, compound queries, pending confirmations). Both results are returned via `AgentResponse.supplementaryResults[]` for the frontend to render in a comparison layout.
- **userId trust boundary**: Supervisor always passes `request.userId` to sub-agents, never LLM-parsed values.
- **Tool whitelist**: 10 tools registered (`check_balance`, `list_bundles`, `check_usage`, `get_support`, `view_bundle_details`, `purchase_bundle`, `top_up`, `create_ticket`, `get_account_summary`, `share_data`).
- **CSS design tokens**: All token variables use the `--color-*` prefix (e.g., `--color-primary`, `--color-bg-card`, `--color-text-primary`, `--color-success`, `--color-error`). Do not use bare names like `--primary` or `--surface` — they will resolve to transparent and break UI visibility.