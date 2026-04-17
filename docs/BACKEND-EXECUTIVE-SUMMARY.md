# Backend Architecture — Executive Summary

## What It Does

The Telecom Agent backend is an AI-powered customer service API that understands natural language requests (e.g. "check my balance", "buy a data bundle") and routes them to the appropriate telecom operation. It returns structured screen data that the frontend renders — not free-form text.

## Key Design Decisions

### 1. Three-Tier Intent Routing — Cost Optimization

Not every request needs an LLM call. The system uses a progressive escalation strategy:

| Tier       | Method                           | Latency | LLM Cost  | Coverage                             |
| ---------- | -------------------------------- | ------- | --------- | ------------------------------------ |
| **Tier 1** | Keyword matching                 | <1 ms   | Zero      | ~70% of common requests              |
| **Tier 2** | Fuzzy cache (Jaccard similarity) | <1 ms   | Zero      | Rephrasings of recent queries        |
| **Tier 3** | LLM with tool calling            | 1–5 s   | Per-token | Complex / entity-extraction requests |

This means most production traffic (balance checks, usage queries, bundle browsing) never touches the LLM, dramatically reducing latency and cost.

### 2. Hexagonal Architecture — Testability & Swappability

The domain logic has **zero framework dependencies**. All external systems (LLM, database, telco APIs) are behind port interfaces, injected at startup. This means:

- **Unit tests** run instantly with simple mocks — no database or HTTP needed
- **Adapters are swappable** — switching from SQLite to Postgres, or from one LLM provider to another, requires only a new adapter implementation
- **Domain rules are portable** — the business logic can move to a different framework without code changes

### 3. Resilience — Circuit Breaker + Per-Tool Degradation

The system degrades gracefully when dependencies fail:

- **Global circuit breaker**: 3 consecutive LLM failures → circuit opens → only Tier 1/2 routing available. After 30 seconds, a probe request tests recovery.
- **Per-tool degradation**: If a specific backend operation (e.g. balance service) fails 3 times for a user, that tool is temporarily disabled for 30 seconds while all other tools remain available.
- **Degraded mode UX**: The frontend shows a warning banner and hides the text input, but quick-action buttons still work via keyword routing.

### 4. Security — Six Layers of Defense

| Layer                   | What It Prevents                      |
| ----------------------- | ------------------------------------- |
| DTO validation          | Oversized payloads, unexpected fields |
| Prompt sanitization     | Injection attacks, control characters |
| Rate limiting           | Abuse (10 req/60s per user)           |
| System prompt hardening | LLM jailbreaking attempts             |
| Tool call whitelist     | Unauthorized operations               |
| Context budget caps     | Token exhaustion, runaway LLM costs   |

### 5. Single Screen Per Request

Each API call returns exactly one screen of data. The supervisor executes one tool call and returns immediately — no chaining. This keeps responses predictable, latency bounded, and the frontend simple.

## Technology Choices

| Component       | Choice                            | Rationale                                                     |
| --------------- | --------------------------------- | ------------------------------------------------------------- |
| Framework       | NestJS 11                         | Mature DI, modular architecture, TypeScript-native            |
| Database        | SQLite (better-sqlite3, WAL mode) | Zero-ops, embedded, sufficient for single-instance deployment |
| LLM Integration | OpenAI-compatible API             | Works with any provider (llama.cpp, DashScope, OpenAI)        |
| Logging         | Pino                              | Structured JSON logging, low overhead                         |
| Caching         | In-memory (Map-based)             | No external dependencies; TTL-based with size limits          |

## API Surface

| Endpoint                       | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `POST /api/agent/chat`         | Process a natural language prompt → structured screen data |
| `POST /api/agent/chat/stream`  | Same, but with SSE streaming (step progress + result)      |
| `GET /api/agent/status`        | LLM availability, circuit breaker state, operating mode    |
| `GET /api/agent/quick-actions` | Button configuration for degraded mode                     |
| `GET /api/history/*`           | Conversation session CRUD                                  |
| `GET /api/health/*`            | Health checks (app + LLM)                                  |
| `GET /api/metrics`             | Operational metrics (admin-key protected)                  |

## Operational Characteristics

- **Startup**: Auto-creates database, runs migrations, seeds demo user data
- **Monitoring**: Built-in metrics (tier resolution rates, LLM latency, tool success/failure, circuit breaker state)
- **Configuration**: 17 environment variables with sensible defaults; intent keywords externalized to JSON
- **Deployment**: Single process, no external services required beyond an LLM endpoint
