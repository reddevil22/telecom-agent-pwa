# Telecom Agent Service — Backend Demo Guide

## What It Is

A NestJS backend that powers an AI-driven telecom customer service agent. Uses a hexagonal (ports & adapters) architecture with a three-tier intent router that resolves ~80% of requests without calling the LLM. Includes a stateful mock telecom system backed by SQLite.

## Key Features

### Three-Tier Intent Routing

Every user request passes through a routing pipeline before any AI call:

| Tier | Method | Intents Covered | LLM Required? |
|------|--------|-----------------|----------------|
| **Tier 1** | Exact keyword match | balance, usage, bundles, support, account | No |
| **Tier 2** | Fuzzy cache (Jaccard similarity ≥ 0.6) | Repeats of previously classified prompts | No |
| **Tier 3** | LLM ReAct loop | purchase, top-up, create ticket (entity extraction) | Yes |

Tier 1 handles 5 single-argument intents instantly. Tier 2 catches rephrasings of previously seen prompts. Only requests requiring entity extraction (bundle IDs, amounts, ticket descriptions) fall through to the LLM.

### Circuit Breaker

Protects against LLM outages with automatic state transitions:

```
CLOSED (normal) → 3 consecutive failures → OPEN (degraded)
OPEN → 30 seconds → HALF_OPEN (probe) → success → CLOSED
```

When open, the API returns degraded responses and the frontend shows a warning banner. Quick-action buttons continue to work via Tier 1 routing.

### Mock Telco System

A stateful simulation of a telecom OSS/BSS, backed by SQLite:

- **Accounts**: Subscriber profiles with real balance management
- **Bundle catalog**: 5 plans ($4.99–$39.99) with purchase flow
- **Subscriptions**: Active bundles with tracked data/voice/SMS consumption
- **Usage simulation**: Every 60 seconds, randomly increments consumption on active subscriptions
- **Tickets**: Support tickets with lifecycle progression (open → in_progress → resolved)
- **FAQ**: Static knowledge base entries

Seed data for `user-1`: $50 balance, 1 active Starter Pack subscription (partially consumed), 2 support tickets, 5 FAQ entries.

### 9 Tool Calls (Sub-Agents)

| Tool | Purpose | Sub-Agent Type |
|------|---------|----------------|
| `check_balance` | Account balance | SimpleQuery |
| `list_bundles` | Bundle catalog | SimpleQuery |
| `check_usage` | Data/voice/SMS usage | SimpleQuery |
| `get_support` | Tickets + FAQ | DualQuery |
| `get_account_summary` | Full account overview | SimpleQuery |
| `view_bundle_details` | Bundle details with affordability check | Specific |
| `purchase_bundle` | Balance deduction + subscription creation | Specific |
| `top_up` | Account top-up with confirmation | Action |
| `create_ticket` | Support ticket creation | Specific |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agent/chat` | POST | Standard chat request |
| `/api/agent/chat/stream` | POST | SSE streaming with step events |
| `/api/agent/status` | GET | LLM health + circuit breaker state |
| `/api/agent/quick-actions` | GET | Static button config (5-min cache) |
| `/api/history/sessions` | GET | List user sessions |
| `/api/history/session/:id` | GET/DELETE | Read or delete a session |
| `/api/health/llm` | GET | LLM server health check |

### Security

Six defense layers: DTO validation (class-validator), prompt sanitization (injection pattern blocking), rate limiting (10 req/60s per session), system prompt hardening, tool call validation (whitelist + schema), and history/budget caps.

## Architecture

```
domain/        → Pure business logic (zero framework deps)
  ports/       → Interfaces (LlmPort, SubAgentPort, BffPorts, IntentRouterPort, CircuitBreakerPort)
  services/    → IntentRouterService, CircuitBreakerService
  types/       → TelecomIntent enum, domain entities
application/   → SupervisorService (orchestrator), sub-agents, intent cache
adapters/      → REST controllers (driving), LLM + BFF adapters (driven)
infrastructure/ → SQLite persistence, mock telco, screen cache, LLM health
```

## Demo Scenarios

1. **Instant balance** — `POST /api/agent/chat { prompt: "show my balance" }` — Tier 1, no LLM call, sub-second
2. **Bundle catalog** — `POST /api/agent/chat { prompt: "what bundles are available" }` — Tier 1
3. **Novel phrasing** — `POST /api/agent/chat { prompt: "remaining funds on my number" }` — Tier 3 first time, Tier 2 on repeat
4. **Entity extraction** — `POST /api/agent/chat { prompt: "buy the Value Plus bundle" }` — Tier 3, LLM extracts bundleId
5. **Account overview** — `POST /api/agent/chat { prompt: "show my account" }` — Tier 1, aggregates profile + subscriptions + activity + tickets
6. **Health check** — `GET /api/agent/status` → `{ llm: "available", mode: "normal", circuitState: "closed" }`

## Tech Stack

NestJS · TypeScript · SQLite (better-sqlite3) · OpenAI-compatible LLM (GLM-5.1) · Jest (172 tests)
