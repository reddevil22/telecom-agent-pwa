# Telecom Agent PWA — Frontend Architecture

## Overview

A React 19 + TypeScript Progressive Web App providing an AI-powered telecom customer service interface. The frontend communicates with a NestJS backend that orchestrates LLM-powered agents.

## Tech Stack

- **Framework**: React 19 with TypeScript (strict mode)
- **Build Tool**: Vite 8 with `vite-plugin-pwa` for service worker
- **State Management**: XState v5 (state machines) with `@xstate/react`
- **Styling**: CSS Modules with CSS custom properties (design tokens)
- **Fonts**: DM Sans (body), DM Serif Display (headings)

## Architecture

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
│   ├── SupportScreen/      # Tickets and FAQ
│   ├── UsageScreen/       # Data/voice/SMS usage
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
  screenType: 'balance' | 'bundles' | 'usage' | 'support' | 'chat';
  screenData: ScreenData;
  message?: string;
}
```

## Backend Communication

The frontend expects a NestJS backend running at `http://localhost:3000` with these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/classify-intent` | POST | Classify user intent from prompt |
| `/api/agent` | POST | Process prompt and return screen data |

See [AGENT.md](./AGENT.md) (backend) for full API specification.

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

## Design Principles

1. **Warm minimal** — Soft edges, generous whitespace, approachable feel
2. **Information density** — Sidebar shows quick stats, main area shows detail
3. **Progressive disclosure** — Simple start, sophisticated on interaction
4. **Accessibility** — WCAG AA contrast ratios, semantic HTML
5. **Responsive** — Mobile-first, sidebar hidden on small screens
