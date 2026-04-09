# Telecom Agent PWA — Frontend Architecture

## Overview

A React 19 + TypeScript Progressive Web App providing an AI-powered telecom customer service interface. The frontend communicates with a NestJS backend that orchestrates LLM-powered agents.

## Tech Stack

- **Framework**: React 19 with TypeScript (strict mode)
- **Build Tool**: Vite 8 with `vite-plugin-pwa` for service worker
- **State Management**: XState v5 (state machines) with `@xstate/react`
- **Styling**: CSS Modules with CSS custom properties (design tokens)
- **Fonts**: DM Sans (body), DM Serif Display (headings)

## LLM

The backend's LLM provider is OpenAI-compatible. During development, **GLM-5.1** was used as the model powering the telecom agent's ReAct loop. The provider is configurable via environment variables (`LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL_NAME` for local; `DASHSCOPE_*` for Alibaba Cloud DashScope).

## LLM Resilience Layer (2026-04)

The app no longer depends on the LLM for every interaction. A three-tier intent router handles ~80% of requests deterministically, a circuit breaker degrades gracefully when the LLM is down, and quick-action buttons work without the LLM entirely.

### Hybrid Intent Routing
```
User prompt
  │
  ├─ Tier 1: Exact keyword match → execute sub-agent directly (no LLM)
  │   Covers: balance, usage, bundles, support, account
  │   Skips BROWSE_BUNDLES when action signals detected (buy, purchase, order, etc.)
  │
  ├─ Tier 2: Fuzzy intent cache → Jaccard similarity on token sets (≥0.6)
  │   After first LLM resolution, similar phrasings hit the cache
  │
  └─ Tier 3: LLM ReAct loop → single tool call per request (no chaining)
      Required for: purchase, top-up, create ticket (entity extraction)
```

### Circuit Breaker
- 3 consecutive LLM failures → circuit opens → all requests go through Tier 1/2 only
- After 30s → half-open → one probe request → close on success, reopen on failure
- `GET /api/agent/status` returns `{ llm, mode, circuitState }` for frontend polling

### Frontend Degraded Mode
- `llmStatusService` polls `/api/agent/status` every 15 seconds
- When `mode: "degraded"`:
  - `DegradedBanner` appears (yellow warning bar)
  - Text input is hidden
  - Quick-action buttons remain functional (Tier 1 routing)

### Quick-Action Buttons
- Persistent button bar below chat: Balance, Bundles, Usage, Support, Account
- `GET /api/agent/quick-actions` returns static config (cached 5 minutes)
- Clicking sends a synthetic prompt through the orchestrator

### SSE Streaming
- `POST /api/agent/chat/stream` returns SSE events for real-time processing updates
- Events: `step` (label + status), `result` (full AgentResponse), `error`
- Falls back to standard POST `/api/agent/chat` if SSE fails

### New Components
| Component | Purpose |
|-----------|---------|
| `QuickActionBar` | Persistent quick-action button bar |
| `DegradedBanner` | Warning banner when LLM is unavailable |
| `llmStatusService` | Polls LLM status, notifies subscribers |

### New Backend Services
| Service | Purpose |
|---------|---------|
| `IntentRouterService` | Three-tier intent classification |
| `IntentCacheService` | Fuzzy token-set matching with Jaccard similarity |
| `CircuitBreakerService` | CLOSED → OPEN → HALF_OPEN state machine |

### New API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agent/status` | GET | LLM availability and circuit state |
| `/api/agent/quick-actions` | GET | Static quick-action button config |
| `/api/agent/chat/stream` | POST | SSE streaming variant of chat |

```
┌─────────────────────────────────────────────────────────────┐
│                         AppShell                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  DegradedBanner (shown when LLM unavailable)         │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  QuickActionBar: [💰 Balance] [📦 Bundles] [📊 Usage] │  │
│  │                  [🎧 Support] [👤 Account]            │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Content Area                              │  │
│  │  ┌──────────────────────────────────────────────────┐│  │
│  │  │           ScreenRenderer                         ││  │
│  │  │  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐       ││  │
│  │  │  │Balance│ │Bundles│ │Usage  │ │Support│ ...   ││  │
│  │  │  └───────┘ └───────┘ └───────┘ └───────┘       ││  │
│  │  └──────────────────────────────────────────────────┘│  │
│  │  ┌──────────────────────────────────────────────────┐│  │
│  │  │     ChatHistory + ProcessingIndicator            ││  │
│  │  └──────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PromptContainer (hidden when degraded)               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Orchestrator     │
                    │ Machine (XState) │
                    │                 │
                    │ idle → processing│
                    │   → rendering    │
                    │   → error        │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────┐
        │ Balance  │  │ Bundles  │  │ Usage    │
        │ Agent    │  │ Agent    │  │ Agent    │
        └──────────┘  └──────────┘  └──────────┘
```

## Directory Structure

```
src/
├── components/
│   ├── AppShell/           # Main layout with header, degraded banner, content
│   ├── ChatBubble/         # User/agent message bubbles
│   ├── DegradedBanner/     # Warning banner when LLM is unavailable
│   ├── ProcessingIndicator/ # Loading animation with step indicators
│   ├── PromptContainer/    # Input field and suggestion chips
│   ├── QuickActionBar/     # Persistent quick-action button bar (balance, bundles, usage, support, account)
│   ├── ScreenRenderer/     # Renders appropriate screen based on state
│   └── SuggestionChips/    # Quick action buttons
├── hooks/
│   └── useSelectors.ts     # XState selectors
├── machines/
│   └── orchestratorMachine.ts  # Main conversation state machine (supports STEP_UPDATE events)
├── screens/
│   ├── BalanceScreen/      # Account balance display
│   ├── BundlesScreen/      # Available bundles/cards
│   ├── BundleDetailScreen/ # Bundle purchase confirmation
│   ├── SupportScreen/      # Tickets and FAQ
│   ├── UsageScreen/        # Data/voice/SMS usage
│   ├── AccountScreen/      # Full account overview (profile, subscriptions, activity, tickets)
│   └── registry.ts         # Screen component map
├── services/
│   ├── agentService.ts     # Agent API calls (standard + SSE streaming)
│   ├── llmStatusService.ts # Polls /api/agent/status, notifies subscribers on mode changes
│   ├── historyService.ts   # Session persistence (localStorage + API)
│   └── intentClassifier.ts # Client-side intent classification
├── theme/
│   ├── tokens.css          # Design tokens (colors, spacing, typography)
│   └── brands/
│       └── default.css     # Brand overrides
├── types/
│   ├── agent.ts            # Agent protocol types (AgentRequest, AgentResponse, ScreenData)
│   ├── screens.ts          # Screen component registry types
│   └── index.ts            # Domain types
├── App.tsx                # Root component
├── main.tsx               # Entry point
└── index.css              # Global styles + scrollbar
```

## State Machine (orchestratorMachine)

### States
- **idle**: Initial state, waiting for user input
- **processing**: Backend is processing the request
- **rendering**: Response received, rendering screen
- **error**: Error occurred

### Events
- `SUBMIT_PROMPT` — User submits text input or clicks quick-action button
- `STEP_UPDATE` — SSE streaming step update (received during processing state)
- `SELECT_SUGGESTION` — User clicks suggestion chip
- `LOAD_SESSION` — Load a previous conversation
- `NEW_SESSION` — Start a new conversation
- `RESET` — Reset from error state

### Selectors
- `selectState` — Current machine state
- `selectCurrentScreenType` — Current screen type (balance|bundles|usage|support)
- `selectCurrentScreenData` — Screen-specific data
- `selectConversationHistory` — Array of conversation messages
- `selectCurrentSuggestions` — Current suggestion chips
- `selectProcessingSteps` — Processing steps for indicator
- `selectHasReceivedFirstResponse` — Whether first response was received

## Design System

### Colors (CSS Custom Properties)
- **Primary**: Coral `#E85D4C` (light) / `#F07A6D` (dark)
- **Secondary**: Teal `#1AAB9A` (light) / `#2EC4B6` (dark)
- **Background**: Off-white `#FAFAF8` (light) / `#1C1C1E` (dark)
- **Text**: Dark charcoal (light) / Light gray (dark)

### Typography
- **Display**: DM Serif Display — headings, large numbers
- **Body**: DM Sans — UI text, labels

### Spacing
Uses 4px base unit: `4, 8, 16, 24, 32, 48, 64`

## API Integration

The frontend communicates with the backend via REST calls. The `agentService.ts` handles:

1. **Intent Classification**: Sends user prompt to `/api/classify-intent`
2. **Agent Processing**: Sends prompt to `/api/agent` with classified intent
3. **Response Parsing**: Extracts screen type and data from response

### Request Shape
```typescript
interface AgentRequest {
  prompt: string;
  intent?: string;
  context?: Record<string, unknown>;
}
```

### Response Shape
```typescript
interface AgentResponse {
  screenType: 'balance' | 'bundles' | 'bundleDetail' | 'usage' | 'support' | 'confirmation' | 'account' | 'unknown';
  screenData: ScreenData;
  message?: string;
}
```

## Backend Communication

The frontend communicates with the backend via REST calls. The backend provides:

### Core Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agent/chat` | POST | Process user prompt and return response |
| `/api/agent/chat/stream` | POST | SSE streaming variant — returns step events then final response |
| `/api/agent/status` | GET | LLM availability and circuit breaker state (`{ llm, mode, circuitState }`) |
| `/api/agent/quick-actions` | GET | Static quick-action button config (cached 5 min) |
| `/api/health` | GET | Backend health check |
| `/api/health/live` | GET | Liveness probe |
| `/api/health/ready` | GET | Readiness probe |
| `/api/health/llm` | GET | LLM server health status |
| `/api/history/sessions` | GET | List user's conversation sessions |
| `/api/history/session/:id` | GET | Get specific conversation |
| `/api/history/session/:id` | DELETE | Soft-delete a conversation |

### Request Shape
```typescript
interface AgentRequest {
  prompt: string;              // max 1000 chars
  sessionId: string;           // rate limit key
  userId: string;              // user identifier
  conversationHistory: {
    role: 'user' | 'agent';
    text: string;              // max 500 chars
    timestamp: number;
  }[];                         // max 20 entries
  timestamp: number;
}
```

### Response Shape
```typescript
interface AgentResponse {
  screenType: 'balance' | 'bundles' | 'bundleDetail' | 'usage' | 'support' | 'confirmation' | 'account' | 'unknown';
  screenData: ScreenData;
  replyText: string;
  suggestions: string[];
  confidence: number;
  processingSteps: ProcessingStep[];
}
```

### History API

| Endpoint | Response |
|----------|----------|
| `GET /api/history/sessions?userId=user-1` | `[{ sessionId, messageCount, updatedAt }]` |
| `GET /api/history/session/:id` | `{ id, sessionId, userId, messages, metadata }` |
| `DELETE /api/history/session/:id` | `{ deleted: true, sessionId }` |

### LLM Health Check

```typescript
interface LlmHealthStatus {
  status: 'healthy' | 'unhealthy' | 'unknown';
  url: string;
  responseTime?: number;
  error?: string;
}
```

See [backend/AGENT.md](./backend/AGENT.md) for full API specification.

## Running the App

```bash
# Development
npm run dev        # Start Vite dev server (port 5173)

# Production
npm run build      # TypeScript check + Vite build
npm run preview    # Preview production build

# Linting
npm run lint       # ESLint
```

## PWA Features

- Service worker via `vite-plugin-pwa`
- Offline support with precached assets
- Installable on mobile/desktop
- App-like experience with safe area insets

## Recent Changes

### Bundle Detail Screen (2025-01)
Added `BundleDetailScreen` component for two-phase bundle purchase flow:
- Shows full bundle details (price, data, minutes, SMS, validity)
- Displays current balance and projected balance after purchase
- Red warning + disabled button if insufficient balance
- "Confirm Purchase" and "Cancel" buttons

**Flow**: User clicks "View Details" → sees BundleDetailScreen → clicks "Confirm Purchase" → backend executes purchase → shows confirmation

**Purpose**: Prevents accidental purchases by requiring explicit confirmation

### ScreenRenderer Updates (2026-04)
- Renders only the primary screen — no supplementary screens. Every request produces exactly one screen.
- Auto-scrolls only when user is already near the bottom (within 100px), avoiding forced scroll override
- Auto-focuses the chat input only when no element in the content area currently has focus

### Mock Telco Backend (2026-04)

The backend now runs a **MockTelcoService** — a stateful simulation of a telecom OSS/BSS backed by SQLite. This replaces the earlier static JSON-file-based adapters. Key behaviors visible from the frontend:

- **Balance is dynamic**: starts at $50, deducts on bundle purchases and top-ups persist across restarts
- **Usage changes over time**: every 60 seconds (configurable), the backend lazily simulates data/voice/SMS consumption against active subscriptions. Asking "check my usage" twice in a demo will show different numbers
- **5 bundles in catalog**: Starter Pack ($9.99), Value Plus ($19.99, popular), Unlimited Pro ($39.99), Weekend Pass ($4.99, promo), Travel Roaming ($14.99, roaming)
- **Bundle purchase deducts real balance**: purchasing flows through `purchaseBundle` → balance deduction → subscription creation → confirmation screen
- **Support tickets progress**: open tickets auto-transition to `in_progress` after ~2 minutes and to `resolved` after ~5 minutes
- **Pre-seeded data**: user-1 has a partially consumed Starter Pack subscription (0.9/2 GB, 49/100 min, 13/50 SMS) and 2 tickets

The frontend code is unchanged — the same `AgentResponse` contract is served. The `docs/ARCHITECTURE.md` file contains a full architecture reference for onboarding.

### Account Dashboard Screen (2026-04)

Added `AccountScreen` component — a read-only dashboard aggregating four sections:
- **Profile card**: Name, phone, plan, status, balance, billing cycle dates
- **Active subscriptions**: Each subscription shows bundle name, expiry, and data/voice/SMS usage bars
- **Recent activity**: Last 5 transactions (purchases, top-ups, ticket events) sorted chronologically
- **Open tickets**: Unresolved support tickets with status badges

**Trigger**: The LLM dispatches the `get_account_summary` tool when the user asks something like "show my account" or "account overview". The backend's `MockTelcoService.getAccountSummary()` aggregates data from `telco_accounts`, `telco_subscriptions` (JOINed with `telco_bundles_catalog`), and `telco_tickets`.

**Frontend files**: `src/screens/AccountScreen/AccountScreen.tsx` + `AccountScreen.module.css`

### Single-Screen Rendering & UX Fixes (2026-04)

Enforced one screen per request — the supervisor returns immediately after the first successful tool call, and the frontend no longer renders supplementary screens.

**Key changes:**
- **Action signal detection**: Tier 1 keyword matching now skips `BROWSE_BUNDLES` when purchase-intent words are present (buy, purchase, order, subscribe, activate, etc.). This prevents "buy the Weekend Pass" from incorrectly routing to the bundle list.
- **Corrected bundle names**: Tool-registry descriptions now match the database — b4=Weekend Pass, b5=Travel Roaming (previously "Social Saver" and "Traveler Pass").
- **System prompt**: Updated to list all 9 tools with explicit purchase flow: `view_bundle_details` first → wait for user confirmation → `purchase_bundle`.
- **Auto-scroll**: Content area smooth-scrolls to the bottom when a response appears, but only if user is already near the bottom.
- **Auto-focus**: Chat input is focused after each response only when no screen element has active focus.

**Files:** `backend/src/application/supervisor/supervisor.service.ts`, `backend/src/application/supervisor/system-prompt.ts`, `backend/src/domain/services/intent-router.service.ts`, `backend/src/domain/constants/tool-registry.ts`, `src/components/ScreenRenderer/ScreenRenderer.tsx`, `src/components/AppShell/AppShell.tsx`, `src/components/PromptContainer/PromptContainer.tsx`.

**Tests**: 174 backend tests. Updated supervisor tests for single-screen behavior.

### Frontend Audit Fixes (2026-04)

Fixed issues found during comprehensive frontend audit:

**SSE streaming** (`agentService.ts`):
- Error events now properly propagate — catch block checks for `SyntaxError` (JSON parse) instead of silently swallowing all errors
- Incomplete SSE data logged with `console.warn` instead of silent drop

**Division by zero** (`UsageScreen.tsx`, `AccountScreen.tsx`):
- Usage bar calculations guard against zero denominators (`total > 0` check)
- Prevents `Infinity`/`NaN` in progress bars when total allowance is 0

**State machine** (`orchestratorMachine.ts`):
- `NEW_SESSION` now generates a fresh session ID and resets all state (history, screen, suggestions, flags)
- `loadSessionData` clears stale screen state (screenType, screenData, suggestions, processing steps) when loading a previous session

**Auto-scroll/auto-focus** (`AppShell.tsx`):
- Auto-scroll only triggers when user is already near the bottom (within 100px)
- Auto-focus only triggers when no element inside the content area has focus, preventing focus theft from screen interactions

**Accessibility** (multiple components):
- Tab navigation: `role="tablist"` and `role="tab"` with `aria-selected`, keyboard arrow-key navigation
- ARIA labels on all interactive elements: quick-action buttons, bundle detail buttons, confirm/cancel buttons, chat input, send button
- Removed unused `llmStatusService` import from `QuickActionBar.tsx`

## Design Principles

1. **Warm minimal** — Soft edges, generous whitespace, approachable feel
2. **Information density** — Sidebar shows quick stats, main area shows detail
3. **Progressive disclosure** — Simple start, sophisticated on interaction
4. **Accessibility** — WCAG AA contrast ratios, semantic HTML, ARIA labels, keyboard navigation
5. **Responsive** — Mobile-first, sidebar hidden on small screens
