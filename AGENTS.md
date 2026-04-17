# Project Guidelines

## Overview

Telecom Agent PWA — an AI-powered telecom customer service app with a React 19 frontend and NestJS backend. The backend orchestrates LLM-powered agents via a three-tier intent routing system with circuit breaker resilience.

## Architecture

- **Frontend**: React 19 + TypeScript + XState v5 + CSS Modules. See [AGENT.md](AGENT.md) for component tree, state machine, and directory layout.
- **Backend**: NestJS with hexagonal architecture (ports & adapters). Domain never imports from application or adapters. See [backend/AGENT.md](backend/AGENT.md) for full module structure and request flow.
- **Docs**: Architecture decisions and specs live in `docs/`. Link to them rather than duplicating content.

### Key Backend Patterns

- **Hexagonal architecture**: All external dependencies injected via ports (interfaces) in `domain/ports/`. Adapters implement ports and are wired in `app.agent-module.ts`.
- **Three-tier intent routing**: Tier 1 (keyword match) → Tier 2 (fuzzy Jaccard cache) → Tier 3 (LLM fallback). Keywords are externalized in `backend/data/intent-keywords.json`.
- **Circuit breaker**: 3 LLM failures → open (30s) → half-open → probe. Frontend polls `/api/agent/status` and shows `DegradedBanner` when degraded.
- **Sub-agents**: Generic patterns (`SimpleQuerySubAgent`, `DualQuerySubAgent`, `ActionSubAgent`) in `application/sub-agents/`. New sub-agents implement `SubAgentPort`.

### Key Frontend Patterns

- **XState orchestrator**: Single state machine (`orchestratorMachine.ts`) manages conversation flow: idle → processing → rendering → error.
- **Screen registry**: `screens/registry.ts` maps screen types to React components. Add new screens there.
- **SSE streaming**: `agentService.ts` handles both standard POST and SSE streaming. Processing steps render via `ProcessingIndicator`.
- **CSS Modules + design tokens**: All styling uses CSS Modules with tokens from `theme/tokens.css`. No CSS-in-JS.

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
