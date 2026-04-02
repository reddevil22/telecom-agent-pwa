# Backend — Telecom Agent Service

NestJS backend that orchestrates an LLM-powered telecom customer service agent. Uses hexagonal (ports & adapters) architecture with a strict dependency rule: domain never imports from application or adapters.

## Architecture

```
src/
├── domain/                  # Pure business logic — zero framework deps
│   ├── constants/           # agent-constants.ts, security-constants.ts
│   ├── ports/               # Interfaces: LlmPort, SubAgentPort, BffPorts
│   ├── tokens.ts            # DI injection tokens (Symbols)
│   └── types/               # agent.ts (request/response), domain.ts (entities)
│
├── application/             # Use-case orchestration
│   ├── supervisor/          # SupervisorService — LLM routing & tool dispatch
│   │   ├── supervisor.service.ts   # Main orchestrator (buildMessages, validateToolCall)
│   │   ├── system-prompt.ts        # LLM system prompt with security rules
│   │   ├── tool-definitions.ts     # 4 tool schemas for LLM function calling
│   │   └── tool-resolver.ts        # toolName → SubAgentPort registry
│   └── sub-agents/          # One per tool: balance, bundles, usage, support
│
├── adapters/
│   ├── driving/rest/        # Inbound — HTTP API
│   │   ├── agent.controller.ts     # POST /api/agent/chat, GET /api/health
│   │   ├── dto/                    # AgentRequestDto with class-validator
│   │   ├── guards/                 # RateLimitGuard (10 req/60s per session)
│   │   └── pipes/                  # PromptSanitizerPipe (injection patterns, control chars)
│   └── driven/              # Outbound — external systems
│       ├── llm/             # OpenAI-compatible adapter (llama-server)
│       └── bff/             # Mock BFF adapters for balance/bundles/usage/support
│
├── config/                  # ConfigModule + envValidationSchema
├── app.agent-module.ts      # Wires all ports, adapters, and sub-agents via DI
├── app.module.ts            # Root: ConfigModule + AgentModule
└── main.ts                  # Bootstrap: ValidationPipe (whitelist+forbid), CORS, /api prefix
```

## Request Flow

```
POST /api/agent/chat
  → RateLimitGuard (sessionId sliding window)
  → ValidationPipe (class-validator DTO checks)
  → PromptSanitizerPipe (control chars, blocked injection patterns)
  → SupervisorService.processRequest()
      → buildMessages() — caps history to 10, wraps userId in <user_context>, 8000-char budget
      → LlmPort.chatCompletion() — sends to llama-server with tool definitions
      → validateToolCall() — verifies tool name + args against ALLOWED_TOOLS whitelist
      → ToolResolver → SubAgentPort.handle(userId) — always uses request.userId, never LLM args
      → Returns AgentResponse with screenType + screenData
```

## Key Design Decisions

- **Domain isolation**: `domain/` has zero NestJS imports. Ports are plain TypeScript interfaces.
- **userId trust boundary**: The supervisor always passes `request.userId` (from session) to sub-agents, never the value parsed from LLM tool call arguments.
- **Defense-in-depth**: 6 security layers — DTO validation, prompt sanitizer, rate limiting, system prompt hardening, tool call validation, history/budget caps. All tunables centralized in `domain/constants/security-constants.ts`.
- **Tool whitelist**: Only 4 tools (`check_balance`, `list_bundles`, `check_usage`, `get_support`). The `validateToolCall()` method rejects unknown tools, unexpected args, and non-string values.
- **LLM adapter**: OpenAI-compatible (`/v1/chat/completions`). Currently targets a local llama-server instance.

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_BASE_URL` | `http://localhost:8080/v1` | LLM API base URL |
| `LLM_API_KEY` | `''` | API key (empty for local) |
| `LLM_MODEL_NAME` | `meta-llama/Llama-3-70b` | Model identifier |
| `LLM_TEMPERATURE` | `0.1` | Sampling temperature |
| `LLM_MAX_TOKENS` | `1024` | Max response tokens |
| `PORT` | `3001` | HTTP server port |
| `NODE_ENV` | `development` | Runtime environment |

## Commands

```bash
npm run start:dev     # Dev server with watch
npm run build         # Compile to dist/
npm run test          # Unit tests (Jest)
npm run test:e2e      # E2E tests
npm run lint          # ESLint
```

## Conventions

- All API routes are prefixed with `/api` (set in `main.ts`).
- DTO validation uses `class-validator` decorators with `whitelist: true` and `forbidNonWhitelisted: true` — extra fields are rejected with 400.
- Sub-agents implement `SubAgentPort` and are registered in `app.agent-module.ts` via `SupervisorService.registerAgent()`.
- Screen types: `balance | bundles | usage | support | unknown`. Mapped from tool names via `TOOL_TO_SCREEN` constant.
- New tools require: tool definition in `tool-definitions.ts`, entry in `ALLOWED_TOOLS` + `TOOL_ARG_SCHEMAS` in `security-constants.ts`, mapping in `TOOL_TO_SCREEN`, a `SubAgentPort` implementation, and registration in `app.agent-module.ts`.
