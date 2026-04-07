# Telecom Agent PWA — Frontend Architecture

## Overview

A React 19 + TypeScript Progressive Web App providing an AI-powered telecom customer service interface. The frontend communicates with a NestJS backend that orchestrates LLM-powered agents.

## Tech Stack

- **Framework**: React 19 with TypeScript (strict mode)
- **Build Tool**: Vite 8 with `vite-plugin-pwa` for service worker
- **State Management**: XState v5 (state machines) with `@xstate/react`
- **Styling**: CSS Modules with CSS custom properties (design tokens)
- **Fonts**: DM Sans (body), DM Serif Display (headings)

## Tech Stack

- **Framework**: React 19 with TypeScript (strict mode)
- **Build Tool**: Vite 8 with `vite-plugin-pwa` for service worker
- **State Management**: XState v5 (state machines) with `@xstate/react`
- **Styling**: CSS Modules with CSS custom properties (design tokens)
- **Fonts**: DM Sans (body), DM Serif Display (headings)

## LLM

The backend's LLM provider is OpenAI-compatible. During development, **GLM-5.1** was used as the model powering the telecom agent's ReAct loop. The provider is configurable via environment variables (`LLM_PROVIDER`, `LLM_BASE_URL`, `LLM_MODEL_NAME` for local; `DASHSCOPE_*` for Alibaba Cloud DashScope).

```
┌─────────────────────────────────────────────────────────────┐
│                         AppShell                             │
│  ┌─────────────┐  ┌─────────────────────────────────────┐ │
│  │   Sidebar   │  │         Content Area                 │ │
│  │             │  │  ┌─────────────────────────────────┐│ │
│  │ • Balance   │  │  │        ScreenRenderer            ││ │
│  │ • Data      │  │  │  ┌───────┐ ┌───────┐ ┌───────┐ ││ │
│  │ • Voice     │  │  │  │Balance│ │Bundles│ │Usage  │ ││ │
│  │ • SMS       │  │  │  │Screen │ │Screen │ │Screen │ ││ │
│  │             │  │  │  └───────┘ └───────┘ └───────┘ ││ │
│  └─────────────┘  │  └─────────────────────────────────┘│ │
│                    │  ┌─────────────────────────────────┐│ │
│                    │  │     ChatHistory + PromptArea    ││ │
│                    │  └─────────────────────────────────┘│ │
│                    └─────────────────────────────────────┘ │
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
│   ├── AppShell/           # Main layout with header, sidebar, content
│   ├── ChatBubble/         # User/agent message bubbles
│   ├── ProcessingIndicator/ # Loading animation during processing
│   ├── PromptContainer/    # Input field and suggestion chips
│   ├── ScreenRenderer/     # Renders appropriate screen based on state
│   └── SuggestionChips/   # Quick action buttons
├── hooks/
│   └── useSelectors.ts    # XState selectors
├── machines/
│   └── orchestratorMachine.ts  # Main conversation state machine
├── screens/
│   ├── BalanceScreen/     # Account balance display
│   ├── BundlesScreen/     # Available bundles/cards
│   ├── BundleDetailScreen/ # Bundle purchase confirmation
│   ├── SupportScreen/      # Tickets and FAQ
│   ├── UsageScreen/       # Data/voice/SMS usage
│   ├── AccountScreen/     # Full account overview (profile, subscriptions, activity, tickets)
│   └── registry.ts        # Screen component map
├── services/
│   ├── agentService.ts    # Main agent (routes to sub-agents)
│   ├── intentClassifier.ts # Classifies user intent
│   └── subAgents/         # Domain-specific agents
│       ├── balanceAgent.ts
│       ├── bundlesAgent.ts
│       ├── supportAgent.ts
│       └── usageAgent.ts
├── theme/
│   ├── tokens.css         # Design tokens (colors, spacing, typography)
│   └── brands/
│       └── default.css    # Brand overrides
├── types/
│   ├── agent.ts           # Agent protocol types
│   ├── screens.ts         # Screen data types
│   └── index.ts           # Domain types
├── App.tsx               # Root component
├── main.tsx              # Entry point
└── index.css             # Global styles + scrollbar
```

## State Machine (orchestratorMachine)

### States
- **idle**: Initial state, waiting for user input
- **processing**: Backend is processing the request
- **rendering**: Response received, rendering screen
- **error**: Error occurred

### Events
- `SUBMIT_PROMPT` — User submits text input
- `SELECT_SUGGESTION` — User clicks suggestion chip

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
  supplementaryResults?: ToolResult[];
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

### ScreenRenderer Updates (2025-01)
- Modified to skip supplementary results when main screen is `confirmation` type
- Prevents duplicate balance display on purchase confirmation

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

## Design Principles

1. **Warm minimal** — Soft edges, generous whitespace, approachable feel
2. **Information density** — Sidebar shows quick stats, main area shows detail
3. **Progressive disclosure** — Simple start, sophisticated on interaction
4. **Accessibility** — WCAG AA contrast ratios, semantic HTML
5. **Responsive** — Mobile-first, sidebar hidden on small screens
