# Architecture Overview

## What This Is

A conversational AI agent for telecom customers. Users type natural-language requests ("show my balance", "what bundles are available?") and get rich screen responses — balances, bundle catalogs, usage charts, support tickets. It runs as a PWA (installable, offline-capable).

## Tech Stack

| Layer         | Technology                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| Frontend      | React 19, TypeScript, XState v5, Vite 8, CSS Modules                                                              |
| Backend       | NestJS 11, TypeScript, SQLite (better-sqlite3)                                                                    |
| LLM           | DashScope (Alibaba Cloud) or local llama-server — any OpenAI-compatible API. GLM-5.1 was used during development. |
| E2E Tests     | Playwright                                                                                                        |
| Backend Tests | Jest + Supertest                                                                                                  |

---

## Request Flow (the happy path)

```
User types a message
       │
       ▼
┌─────────────────────────────────┐
│  Frontend (XState Machine)      │
│  State: idle → processing       │
│  POST /api/agent/chat           │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  NestJS Controller              │
│  Validates DTO, applies guards  │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  SupervisorService (ReAct loop) │
│                                 │
│  1. Deterministic pre-check    │
│     (share-data, top-up,       │
│      purchase) — no LLM       │
│  2. Keyword match — no LLM     │
│  3. Build message history with  │
│     system prompt + context     │
│  4. Call LLM with tool defs     │
│  5. LLM picks a tool → route   │
│     to the matching sub-agent   │
│  6. Bounded second tool call  │
│     for comparison/compound/   │
│     pending-confirmation       │
│  7. Return primary +          │
│     supplementary results     │
│  8. Store in cache, persist to  │
│     SQLite                     │
└──────────────┬──────────────────┘
               │
               ▼
┌─────────────────────────────────┐
│  Frontend renders response      │
│  State: processing → rendering  │
│                                 │
│  screenRegistry maps            │
│  screenType → React component   │
│  (balance, bundles, usage,      │
│   support, confirmation)        │
└─────────────────────────────────┘
```

---

## Frontend Architecture

### State Machine (`src/machines/orchestratorMachine.ts`)

The entire conversation flow is managed by an XState v5 state machine with these states:

```
initializing → idle → processing → rendering → idle (loop)
                  ↘ loadingSession → idle
                  ↘ error
```

**Context** (machine state):

- `conversationHistory` — chat messages
- `currentScreenType` / `currentScreenData` — what to render
- `currentSuggestions` — quick-reply chips
- `sessionId` — conversation identifier
- `processingSteps` — progress indicator data

**Events**: `SUBMIT_PROMPT`, `LOAD_SESSION`, `NEW_SESSION`, `RESET`

### Screen Rendering (`src/screens/registry.ts`)

A `Map<ScreenType, ReactComponent>` lookup. When the backend returns `screenType: 'balance'`, the `ScreenRenderer` component pulls `BalanceScreen` from the registry and passes `screenData` as props. To add a new screen: create the component, add an entry in the registry, add the type to the `ScreenData` union.

### Component Tree

```
App
 └─ ErrorBoundary
     └─ AppShell
         ├─ Header (brand + theme toggle)
         ├─ Tab bar (Chat | History)
         ├─ Chat tab:
         │   ├─ ChatBubble[] (conversation history)
         │   ├─ ProcessingIndicator (loading steps)
         │   ├─ ScreenRenderer → ScreenRegistry → concrete screen
         │   └─ PromptContainer (input + suggestion chips)
         └─ History tab:
             └─ SessionList
```

### Key Files

| File                                  | Purpose                                                           |
| ------------------------------------- | ----------------------------------------------------------------- |
| `src/App.tsx`                         | Root — boots the XState machine, wraps in ErrorBoundary           |
| `src/machines/orchestratorMachine.ts` | State machine definition and all transitions                      |
| `src/services/agentService.ts`        | Thin `fetch` wrapper for `POST /api/agent/chat`                   |
| `src/services/historyService.ts`      | Session CRUD via backend API                                      |
| `src/types/agent.ts`                  | `AgentRequest`, `AgentResponse`, `ScreenData` discriminated union |
| `src/screens/registry.ts`             | ScreenType → component map                                        |

---

## Backend Architecture

### Hexagonal (Ports & Adapters)

```
backend/src/
├── domain/           # Core — no framework dependencies
│   ├── ports/        # Interfaces (LlmPort, SubAgentPort, etc.)
│   ├── types/        # Shared types (AgentRequest, AgentResponse)
│   ├── constants/    # Tool definitions, security limits
│   └── tokens.ts     # DI tokens
│
├── application/      # Use cases
│   ├── supervisor/   # SupervisorService — the ReAct loop
│   └── sub-agents/   # BalanceAgent, BundlesAgent, UsageAgent, SupportAgent, DataGiftAgent
│
├── adapters/
│   ├── driving/      # Inbound
│   │   └── rest/     # Controllers, DTOs, guards, pipes
│   └── driven/       # Outbound
│       ├── llm/      # OpenAI-compatible LLM adapter
│       └── bff/      # External service adapters (balance, bundles, data-gift, etc.)
│
└── infrastructure/   # Cross-cutting
    ├── data/         # SQLite access (better-sqlite3)
    ├── cache/        # In-memory screen cache
    ├── interceptors/ # LoggingInterceptor
    ├── filters/      # AllExceptionsFilter
  └── middleware/    # Legacy stubs (request context is set via interceptor + guard)
```

### The Supervisor (ReAct Loop)

`SupervisorService` is the brain. It implements a **ReAct** (Reason + Act) pattern:

1. **Build context** — system prompt + conversation history (capped at `SUPERVISOR_HISTORY_CAP` messages, trimmed to `TOTAL_CHARS_BUDGET`)
2. **Call LLM** — sends tool definitions, LLM decides which tool to call
3. **Validate** — checks tool name against allowlist, validates argument schema
4. **Execute** — routes to the registered `SubAgentPort` implementation
5. **Loop** — feeds tool result back to LLM; if LLM calls another tool, repeat
6. **Return** — when LLM stops calling tools, build the `AgentResponse`

**Safety guards:**

- `SUPERVISOR_MAX_ITERATIONS` caps the loop
- `ALLOWED_TOOLS` whitelist prevents arbitrary tool calls
- `TOOL_ARG_SCHEMAS` validates argument keys and types
- Instruction leak detection (LLM returning text alongside tool calls)

### Sub-Agents

Each implements `SubAgentPort`:

```typescript
interface SubAgentPort {
  handle(
    userId: string,
    params?: Record<string, string>,
  ): Promise<{
    screenData: ScreenData;
    processingSteps: ProcessingStep[];
  }>;
}
```

Registered via `SupervisorService.registerAgent(toolName, agent)`. The current set:

| Tool Name             | Agent                     | Screen       |
| --------------------- | ------------------------- | ------------ |
| `check_balance`       | SimpleQuerySubAgent       | balance      |
| `list_bundles`        | SimpleQuerySubAgent       | bundles      |
| `view_bundle_details` | ViewBundleDetailsSubAgent | bundleDetail |
| `purchase_bundle`     | PurchaseBundleSubAgent    | confirmation |
| `check_usage`         | SimpleQuerySubAgent       | usage        |
| `create_ticket`       | CreateTicketSubAgent      | confirmation |
| `get_support`         | DualQuerySubAgent         | support      |
| `top_up`              | ActionSubAgent            | confirmation |
| `get_account_summary` | SimpleQuerySubAgent       | account      |
| `share_data`          | DataGiftSubAgent          | dataGift     |

`purchase_bundle`, `top_up`, and `share_data` are **gated** two-step UX flows: the backend returns a review/confirmation screen with `requiresUserConfirmation: true` and a `confirmationToken`. The frontend must send a second `SUBMIT_PROMPT` with `confirmationAction: { token, decision: "confirm" }` to execute the action.

`top_up` additionally has an inline variant: `BundleDetailScreen` renders a `TopUpPanel` component when balance is insufficient. The panel sends the top-up through the XState machine (same as chat), and uses a `window.__topUpPanel` callback API to receive success/error responses from the parent when the machine's screen state transitions.

### Caching

Keyword-based screen cache: if the user's prompt contains intent keywords ("balance", "bundles", etc.) and there's exactly one match, the cached response is returned without calling the LLM. Cache invalidates on any `confirmation` screen (i.e., after a purchase).

### Data Layer

SQLite with `better-sqlite3`. Two tables:

- `conversations` — session metadata (id, userId, timestamps)
- `messages` — conversation history (role, text, screenType, timestamp)

Migrations run on startup via `sqlite-connection.service.ts` in `SqliteDataModule`.

---

## Frontend ↔ Backend Contract

Single endpoint: `POST /api/agent/chat`

**Request:**

```typescript
{
  prompt: string;
  sessionId: string;
  userId: string;
  conversationHistory: {
    role: "user" | "agent";
    text: string;
    timestamp: number;
  }
  [];
  timestamp: number;
}
```

**Response:**

```typescript
{
  screenType: 'balance' | 'bundles' | 'bundleDetail' | 'usage'
            | 'support' | 'confirmation' | 'dataGift' | 'unknown';
  screenData: ScreenData;    // discriminated union on screenType
  replyText: string;
  suggestions: string[];
  confidence: number;
  processingSteps: { label: string; status: 'pending' | 'active' | 'done' }[];
  supplementaryResults?: ToolResult[];
}
```

The frontend uses `screenType` to pick the right React component and passes `screenData` as typed props.

---

## Security Layers

| Layer            | Mechanism                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Input validation | `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` on all DTOs                               |
| Rate limiting    | Custom guard on controller routes                                                                    |
| Tool validation  | Allowlist + argument schema check in supervisor                                                      |
| Prompt injection | Character budget on history, instruction leak detection                                              |
| LLM output       | Tool calls validated before execution                                                                |
| CORS             | Restricted by `CORS_ORIGINS` (defaults include `localhost:5173`, `127.0.0.1:5173`, `localhost:3000`) |

---

## Running the Project

```bash
# Backend
cd backend && cp .env.example .env   # configure LLM_BASE_URL, LLM_API_KEY, etc.
npm install && npm run start:dev      # http://localhost:3001

# Frontend (root)
cp .env.example .env                  # VITE_API_BASE_URL=http://localhost:3001
npm install && npm run dev            # http://localhost:5173
```

Vite proxies `/api/*` to the NestJS backend during development.
