# Telecom Agent PWA — Full-Stack Architecture

> Engineering reference for the AI-powered telecom customer service application.

## What This Project Does

A full-stack web application where users chat with an AI agent that understands natural-language telecom queries (balance, bundles, usage, support). The agent decides which backend service to call via an LLM-driven ReAct loop, retrieves real data, and renders purpose-built screens — not generic chat bubbles.

**Two repos in one monorepo:**

| Layer | Location | Stack | Port |
|-------|----------|-------|------|
| Frontend (PWA) | `/` (repo root) | React 19, TypeScript, Vite 8, XState v5 | 5173 (dev) |
| Backend API | `/backend` | NestJS 11, TypeScript, Express 5 | 3001 |

Vite's dev proxy forwards `/api/*` to the backend, so the frontend calls `/api/agent/chat` directly.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (React PWA)                        │
│                                                                     │
│  ┌──────────┐   ┌──────────────────────┐   ┌───────────────────┐  │
│  │ AppShell  │──▶│ Orchestrator Machine  │──▶│ ScreenRenderer    │  │
│  │ (layout)  │   │ (XState state machine)│   │ (dynamic screens) │  │
│  └──────────┘   └──────────┬───────────┘   └───────────────────┘  │
│                            │                                        │
│                   agentService.ts                                   │
│                   POST /api/agent/chat                              │
└────────────────────────────┬────────────────────────────────────────┘
                             │  HTTP (JSON)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Backend (NestJS)                               │
│                                                                     │
│  ┌──────────────────── Request Pipeline ────────────────────────┐  │
│  │  CorrelationId → ValidationPipe → RateLimitGuard             │  │
│  │  → PromptSanitizerPipe → LoggingInterceptor → Controller     │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────── Agent Layer ───────────────────────────┐   │
│  │  SupervisorService (ReAct loop, max 3 iterations)            │   │
│  │    ├── ToolResolver → check_balance → BalanceSubAgent        │   │
│  │    ├── ToolResolver → list_bundles → BundlesSubAgent         │   │
│  │    ├── ToolResolver → check_usage  → UsageSubAgent           │   │
│  │    └── ToolResolver → get_support → SupportSubAgent          │   │
│  └──────────────────────────────────────────────────────────────┘  │
│                            │                                        │
│           ┌────────────────┼────────────────┐                      │
│           ▼                ▼                ▼                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐              │
│  │ LLM Adapter  │ │ BFF Adapters │ │ Pino Logger  │              │
│  │ (OpenAI-compat)│ │ (mock data)  │ │ (structured) │              │
│  └──────────────┘ └──────────────┘ └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Backend Deep Dive

### Hexagonal Architecture (Ports & Adapters)

The backend follows a strict dependency rule: **dependencies point inward**. Domain has zero framework imports.

```
backend/src/
├── domain/                          # Pure business logic, zero NestJS deps
│   ├── types/
│   │   ├── domain.ts                # Balance, Bundle, UsageEntry, SupportTicket, ConversationMessage
│   │   └── agent.ts                 # AgentRequest, AgentResponse, ScreenType, ScreenData, ToolResult
│   ├── ports/
│   │   ├── llm.port.ts              # LlmPort interface (chatCompletion)
│   │   ├── sub-agent.port.ts        # SubAgentPort interface (handle → ScreenData)
│   │   └── bff-ports.ts             # BalanceBffPort, BundlesBffPort, UsageBffPort, SupportBffPort
│   ├── constants/
│   │   ├── agent-constants.ts       # REPLY_MAP, SUGGESTION_MAP, TOOL_TO_SCREEN mappings
│   │   └── security-constants.ts    # Rate limits, prompt max lengths, blocked injection patterns
│   └── tokens.ts                    # DI injection tokens (Symbol-based)
│
├── application/                     # Use-case orchestration
│   ├── supervisor/
│   │   ├── supervisor.service.ts    # ReAct loop — the core orchestration engine
│   │   ├── system-prompt.ts         # LLM system prompt (tool descriptions + security rules)
│   │   ├── tool-definitions.ts      # OpenAI-style function definitions for 4 tools
│   │   └── tool-resolver.ts         # Runtime registry: tool name → SubAgentPort
│   └── sub-agents/
│       ├── balance-sub-agent.service.ts   # Delegates to BalanceBffPort
│       ├── bundles-sub-agent.service.ts   # Delegates to BundlesBffPort
│       ├── usage-sub-agent.service.ts     # Delegates to UsageBffPort
│       └── support-sub-agent.service.ts   # Delegates to SupportBffPort
│
├── adapters/
│   ├── driving/rest/                # Inbound (driving) adapter — HTTP API
│   │   ├── agent.controller.ts      # POST /api/agent/chat, GET /api/health/*
│   │   ├── dto/agent-request.dto.ts # Request validation (class-validator)
│   │   ├── guards/rate-limit.guard.ts   # Per-session rate limiting (10 req/min)
│   │   └── pipes/prompt-sanitizer.pipe.ts # Injection detection + control char stripping
│   │
│   └── driven/                      # Outbound (driven) adapters — external services
│       ├── llm/
│       │   ├── openai-compatible.adapter.ts  # Fetch-based LLM client (any OpenAI-compatible API)
│       │   └── llm.module.ts                 # DI wiring
│       └── bff/                     # Backend-for-Frontend adapters (currently mock)
│           ├── balance/mock-balance-bff.adapter.ts
│           ├── bundles/mock-bundles-bff.adapter.ts
│           ├── usage/mock-usage-bff.adapter.ts
│           └── support/mock-support-bff.adapter.ts
│
├── infrastructure/                  # Cross-cutting concerns
│   ├── logging/pino-logger.module.ts       # Global pino logger config
│   ├── middleware/correlation-id.middleware.ts  # UUID per request
│   ├── interceptors/logging.interceptor.ts      # Request/response timing
│   └── filters/all-exceptions.filter.ts        # Global error handler
│
├── config/
│   ├── config.module.ts             # NestJS ConfigModule with validated env
│   └── env.validation.ts            # Environment variable schema + defaults
│
├── app.module.ts                    # Root module (Logger, Config, Agent)
├── app.agent-module.ts              # Agent feature module (wires everything together)
└── main.ts                          # Bootstrap: pipes, CORS, global filter/interceptor
```

### The ReAct Supervisor Loop

This is the core of the backend. The `SupervisorService` runs an iterative LLM tool-calling loop:

```
User prompt
    │
    ▼
Build messages: [system prompt | conversation history | user context + prompt]
    │
    ▼
┌─────────────────── Iteration Loop (max 3) ───────────────────┐
│  1. Send messages + tool definitions to LLM                   │
│  2. LLM responds with either:                                 │
│     a) A tool call (e.g. check_balance)                       │
│     b) Plain text (gibberish/unknown → return immediately)    │
│  3. Validate tool call against ALLOWED_TOOLS + arg schema     │
│  4. Resolve tool → SubAgent → BFF adapter → get data          │
│  5. First tool call → primary result                           │
│  6. Subsequent calls → supplementary results                   │
│  7. Feed summary back to LLM for next iteration               │
│  8. If LLM stops calling tools → build and return response    │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
AgentResponse { screenType, screenData, replyText, suggestions, supplementaryResults }
```

**Key design decisions:**
- The LLM decides which tool(s) to call — no manual intent classification on the backend
- Tool calls are validated against a strict allowlist; unexpected tools/args are rejected
- `userId` comes from the request (authenticated), never from LLM-generated arguments
- A character budget (8,000 chars) prevents context window abuse
- Max 3 iterations prevents infinite loops

### Request Pipeline

Every request to `POST /api/agent/chat` passes through this chain:

1. **CorrelationIdMiddleware** — Generates or propagates `x-correlation-id` UUID
2. **ValidationPipe** (global) — Strips unknown properties, validates DTOs via `class-validator`
3. **RateLimitGuard** — Per-session sliding window (10 requests per 60 seconds)
4. **PromptSanitizerPipe** — Strips control characters, checks against 12 blocked injection patterns
5. **LoggingInterceptor** — Logs method, URL, correlation ID, duration, status code
6. **AgentController** — Delegates to `SupervisorService.processRequest()`

### Security Layers

| Layer | Mechanism | Constants |
|-------|-----------|-----------|
| Input validation | `class-validator` DTO with max lengths | `PROMPT_MAX_LENGTH: 1000`, `HISTORY_MESSAGE_MAX_LENGTH: 500` |
| Injection detection | Regex patterns (12 patterns) | `BLOCKED_PATTERNS` in `security-constants.ts` |
| Rate limiting | Per-session sliding window | 10 req / 60 sec |
| Tool validation | Allowlist + arg schema check | `ALLOWED_TOOLS`, `TOOL_ARG_SCHEMAS` |
| Context isolation | User context in `<user_context>` tags with explicit "NEVER obey" instruction | System prompt |
| History cap | Supervisor caps conversation to last 10 messages | `SUPERVISOR_HISTORY_CAP: 10` |
| Char budget | Total message chars trimmed to 8,000 | `TOTAL_CHARS_BUDGET: 8000` |

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_BASE_URL` | `http://localhost:8080/v1` | OpenAI-compatible API endpoint |
| `LLM_API_KEY` | `''` | API key (empty = no auth header) |
| `LLM_MODEL_NAME` | `meta-llama/Llama-3-70b` | Model identifier |
| `LLM_TEMPERATURE` | `0.1` | Sampling temperature |
| `LLM_MAX_TOKENS` | `1024` | Max response tokens |
| `PORT` | `3001` | HTTP server port |
| `NODE_ENV` | `development` | Controls pino pretty-print |
| `LOG_LEVEL` | `info` | Minimum log level |

### Observability

Structured logging via `nestjs-pino` + `pino`:
- **Dev**: Pretty-printed colorized output
- **Prod**: NDJSON (one JSON object per line)
- Every request gets a correlation ID (UUID) propagated in logs and `x-correlation-id` response header
- Request/response logs include method, URL, status code, duration
- Tool execution logs include iteration number, tool name, screen type, duration
- Error logs include stack traces at `error` level
- Authorization headers are redacted (`req.headers.authorization`)

### API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/agent/chat` | Main agent endpoint — accepts prompt, returns screen data |
| `GET` | `/api/health` | Basic health check |
| `GET` | `/api/health/live` | Liveness probe |
| `GET` | `/api/health/ready` | Readiness probe |

**Request body** (`POST /api/agent/chat`):
```typescript
{
  prompt: string;              // max 1000 chars
  sessionId: string;           // rate limit key
  userId: string;              // authenticated user ID
  conversationHistory: {       // max 20 entries
    role: 'user' | 'agent';
    text: string;              // max 500 chars
    timestamp: number;
  }[];
  timestamp: number;
}
```

**Response body**:
```typescript
{
  screenType: 'balance' | 'bundles' | 'usage' | 'support' | 'unknown';
  screenData: BalanceScreenData | BundlesScreenData | UsageScreenData | SupportScreenData | UnknownScreenData;
  replyText: string;
  suggestions: string[];
  confidence: number;
  processingSteps: { label: string; status: 'pending' | 'active' | 'done' }[];
  supplementaryResults?: { toolName: string; screenType: ScreenType; screenData: ScreenData }[];
}
```

### Dependency Injection Wiring

The `AgentModule` (`app.agent-module.ts`) is the composition root:

```
AgentModule
  imports: LlmModule, BalanceBffModule, BundlesBffModule, UsageBffModule, SupportBffModule
  provides: SupervisorService (factory)
    injects: LLM_PORT, BALANCE_BFF_PORT, BUNDLES_BFF_PORT, USAGE_BFF_PORT, SUPPORT_BFF_PORT, ConfigService, PinoLogger
    registers sub-agents: check_balance, list_bundles, check_usage, get_support
  controllers: AgentController, HealthController
```

DI tokens are `Symbol`s defined in `domain/tokens.ts` — this prevents string collisions and keeps the domain layer framework-agnostic.

### Testing

```
88 unit tests  (src/**/*.spec.ts)
16 e2e tests   (test/**/*.e2e-spec.ts)
```

- **Unit tests**: Jest + `@nestjs/testing`. Services are instantiated directly with mock ports.
- **E2E tests**: Supertest against the full NestJS app. Tests cover all 4 screen types, rate limiting, injection detection, invalid requests, and supervisor edge cases.

---

## Frontend Deep Dive

### Directory Structure

```
src/
├── App.tsx                          # Root — creates XState machine, renders AppShell
├── main.tsx                         # Entry point — React root + PWA service worker
├── index.css                        # Global styles + scrollbar
│
├── machines/
│   └── orchestratorMachine.ts       # XState v5 state machine (idle → processing → rendering → error)
│
├── hooks/
│   └── useSelectors.ts             # Typed XState selectors (one per context field)
│
├── services/
│   └── agentService.ts             # fetch() wrapper for POST /api/agent/chat
│
├── components/
│   ├── AppShell/                    # Main layout: header, sidebar, content, prompt
│   ├── ChatBubble/                  # User/agent message bubbles
│   ├── ProcessingIndicator/         # Animated step indicator during LLM processing
│   ├── PromptContainer/             # Text input + suggestion chips
│   ├── ScreenRenderer/              # Dynamic screen dispatcher (primary + supplementary)
│   └── SuggestionChips/             # Quick-action pill buttons
│
├── screens/
│   ├── BalanceScreen/               # Account balance card
│   ├── BundlesScreen/               # Bundle/grid cards with "Popular" badge
│   ├── UsageScreen/                 # Data/voice/SMS usage bars
│   ├── SupportScreen/               # Ticket list + FAQ accordion
│   └── registry.ts                  # Map<ScreenType, ReactComponent> — extensible screen registry
│
├── types/
│   ├── index.ts                     # Domain types (Balance, Bundle, etc.) — mirrors backend
│   ├── agent.ts                     # Agent protocol types (request/response/screen data)
│   └── screens.ts                   # ScreenRegistry type definition
│
└── theme/
    ├── tokens.css                   # Design tokens (colors, spacing, typography, shadows)
    └── brands/default.css           # Brand overrides
```

### State Machine (XState v5)

The entire UI state is managed by a single state machine:

```
idle ──SUBMIT_PROMPT──▶ processing ──onDone──▶ rendering
                           │                       │
                           │ onError               │ SUBMIT_PROMPT
                           ▼                       ▼
                         error ──SUBMIT_PROMPT──▶ processing
                            │
                            │ RESET
                            ▼
                          idle
```

**Context shape:**
```typescript
{
  conversationHistory: ConversationMessage[];  // Full chat history
  currentScreenType: string | null;            // Which screen to show
  currentScreenData: ScreenData | null;        // Data for the screen
  currentSuggestions: string[];                // Quick-action chips
  lastAgentReply: string | null;
  processingSteps: ProcessingStep[];           // For the animated indicator
  supplementaryResults: ToolResult[];          // Additional screens from multi-tool calls
  hasReceivedFirstResponse: boolean;           // Controls initial/welcome vs. chat view
  error: string | null;
}
```

**Key behavior:**
- `SUBMIT_PROMPT` appends the user message to history and transitions to `processing`
- The `callAgent` actor calls `invokeAgentService()` (the fetch wrapper)
- On success, context is updated with response data and machine moves to `rendering`
- On error, machine moves to `error` state
- From `rendering` or `error`, a new `SUBMIT_PROMPT` goes back to `processing`

### Screen Registry Pattern

Screens are registered in a `Map<string, ScreenDefinition>`:

```typescript
// registry.ts
export const screenRegistry = new Map([
  ['balance', { component: BalanceScreen, displayName: 'Balance' }],
  ['bundles', { component: BundlesScreen, displayName: 'Bundles' }],
  ['usage',   { component: UsageScreen,   displayName: 'Usage' }],
  ['support', { component: SupportScreen, displayName: 'Support' }],
]);
```

The `ScreenRenderer` component:
1. Reads `currentScreenType` and `currentScreenData` from the machine
2. Looks up the component in the registry
3. Renders the primary screen
4. Also renders any `supplementaryResults` as additional screens below the primary

To add a new screen type, you create the component, add it to the registry, and the backend returns the matching `screenType`.

### Data Flow: End-to-End Request

```
1. User types "Show my balance" and hits Enter
2. PromptContainer sends SUBMIT_PROMPT to the XState actor
3. Machine transitions idle → processing
4. callAgent actor fires: POST /api/agent/chat with { prompt, sessionId, userId, conversationHistory, timestamp }
5. Vite dev proxy forwards to http://localhost:3001/api/agent/chat
6. Backend pipeline: CorrelationId → Validation → RateLimit → Sanitizer → Logging → Controller
7. Controller calls SupervisorService.processRequest()
8. Supervisor builds messages, sends to LLM with tool definitions
9. LLM responds with tool_call: check_balance
10. Supervisor validates tool call, resolves to BalanceSubAgent
11. BalanceSubAgent calls MockBalanceBffAdapter.getBalance()
12. Result fed back to LLM; LLM decides no more tools needed
13. Supervisor builds AgentResponse { screenType: 'balance', screenData: { type: 'balance', balance: {...} }, ... }
14. Controller returns JSON response
15. Machine transitions processing → rendering
16. Context updated: currentScreenType='balance', currentScreenData={...}
17. ScreenRenderer looks up BalanceScreen in registry, renders with data
18. User sees balance card with $42.50, last top-up date, next billing date
```

### PWA Configuration

Configured via `vite-plugin-pwa` in `vite.config.ts`:
- **Service worker**: Auto-updating (no manual reload needed)
- **Precaching**: JS, CSS, HTML, icons, fonts, SVGs via Workbox glob patterns
- **Manifest**: Standalone display, portrait orientation, custom theme/background colors
- **Icons**: 192x192 and 512x512 PNGs

### Design System

**Typography**: DM Serif Display (headings) + DM Sans (body)

**Color palette** (CSS custom properties in `theme/tokens.css`):

| Token | Light | Dark |
|-------|-------|------|
| Primary (coral) | `#E85D4C` | `#F07A6D` |
| Secondary (teal) | `#1AAB9A` | `#2EC4B6` |
| Background | `#FAFAF8` | `#1C1C1E` |
| Surface | `#FFFFFF` | `#2C2C2E` |
| Text primary | `#1C1C1E` | `#F5F5F5` |

**Spacing**: 4px base unit grid (4, 8, 16, 24, 32, 48, 64)

**Styling approach**: CSS Modules (one `.module.css` per component) + CSS custom properties for theming. Dark mode toggled via `data-theme="dark"` attribute on `<html>`.

---

## Running the Project

### Prerequisites
- Node.js 20+
- An OpenAI-compatible LLM API (default: `http://localhost:8080/v1`)

### Backend

```bash
cd backend
npm install
npm run start:dev      # Starts on port 3001 with hot reload
```

### Frontend

```bash
npm install            # At repo root
npm run dev            # Starts on port 5173, proxies /api to backend
```

### Running Tests

```bash
# Backend
cd backend
npm test               # 88 unit tests
npm run test:e2e       # 16 e2e tests (requires app running)

# Frontend
npm run lint           # ESLint
npm run build          # TypeScript check + Vite build
```

---

## Key Design Decisions

### Why ReAct instead of intent classification?
The LLM itself acts as the router. This eliminates a separate classification step, handles multi-turn reasoning naturally, and allows the LLM to call multiple tools in sequence (e.g. check balance, then suggest bundles).

### Why hexagonal architecture?
The domain layer (`domain/`) has zero NestJS imports. All framework code lives in adapters. This means:
- Sub-agents and domain logic can be tested without any framework mocking
- BFF adapters can be swapped from mock to real without touching business logic
- The LLM adapter can be replaced (OpenAI → Gemini → local) by implementing `LlmPort`

### Why XState on the frontend?
A state machine makes the UI states explicit and impossible to get into inconsistent combinations. The machine owns all state — components just subscribe via selectors. No prop drilling, no context providers, no useEffect chains.

### Why mock BFF adapters?
The BFF (Backend-for-Frontend) layer represents downstream telecom systems (billing, CRM, ticketing). In development, mock adapters return realistic hardcoded data. In production, each adapter would call real APIs — zero changes needed in domain or application layers.

### Why Symbol-based DI tokens?
String tokens risk collisions as the codebase grows. Symbols are globally unique and can be imported from `domain/tokens.ts` without circular dependencies.

---

## Extending the System

### Adding a new screen type (e.g. "Plans")

1. **Domain**: Add `Plan` interface to `domain/types/domain.ts`
2. **Domain**: Add `PlansScreenData` to `domain/types/agent.ts`, add `'plans'` to `ScreenType` union
3. **Domain**: Add `PlansBffPort` to `domain/ports/bff-ports.ts`, add `PLANS_BFF_PORT` to `domain/tokens.ts`
4. **Application**: Create `PlansSubAgent` implementing `SubAgentPort`
5. **Adapter**: Create `mock-plans-bff.adapter.ts` and `PlansBffModule`
6. **Adapter**: Add `tool_definition` for `list_plans` in `tool-definitions.ts`
7. **Constants**: Add mapping in `TOOL_TO_SCREEN`, `REPLY_MAP`, `SUGGESTION_MAP`
8. **Wiring**: Register in `app.agent-module.ts`
9. **Frontend**: Create `PlansScreen` component, add to `registry.ts`
10. **Frontend types**: Mirror the new types in `src/types/`

### Connecting real BFF APIs

Replace mock adapters with real HTTP clients:

```typescript
// adapters/driven/bff/plans/real-plans-bff.adapter.ts
export class RealPlansBffAdapter implements PlansBffPort {
  constructor(private readonly baseUrl: string) {}
  async getPlans(userId: string): Promise<Plan[]> {
    const res = await fetch(`${this.baseUrl}/plans?userId=${userId}`);
    return res.json();
  }
}
```

Update the module's `useFactory` to read the real API URL from `ConfigService`. No changes to domain, application, or controller layers.

### Adding authentication

The `userId` is currently sent by the frontend. To add real auth:
1. Add a `JwtAuthGuard` or session middleware
2. Extract `userId` from the token/session in the controller
3. Override the DTO's `userId` with the authenticated value
4. The rest of the stack (supervisor, sub-agents, BFF) remains unchanged
