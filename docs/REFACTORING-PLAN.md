# Codebase Refactoring Plan

> Modernization roadmap for the Telecom Agent PWA, organized into phases by risk and impact. Each phase is independently shippable.

---

## Phase 1 — Dead Code Removal & Hygiene (Low Risk, High Impact)

**Goal**: Remove 16 dead files and fix configuration inconsistencies. Zero behavioral change.

### 1.1 Remove Legacy Adapters & Fixtures

Delete 16 unused files from three generations of BFF adapter evolution:

| Category                 | Files to Delete                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| File-backed adapters (4) | `file-balance-bff.adapter.ts`, `file-bundles-bff.adapter.ts`, `file-usage-bff.adapter.ts`, `file-support-bff.adapter.ts` |
| Simple mock adapters (4) | `mock-balance-bff.adapter.ts`, `mock-bundles-bff.adapter.ts`, `mock-usage-bff.adapter.ts`, `mock-support-bff.adapter.ts` |
| JSON data files (6)      | `backend/src/data/balances.json`, `bundles.json`, `owned-bundles.json`, `support.json`, `usage.json`, `users.json`       |
| Dead infrastructure (2)  | `json-data-store.ts`, `json-data.module.ts`                                                                              |

**Verification**: `npm run build` passes, `npm test` passes, `npm run test:e2e` passes.

### 1.2 Remove Legacy Sub-Agent Classes

Four sub-agents (`BalanceSubAgent`, `BundlesSubAgent`, `SupportSubAgent`, `UsageSubAgent`) were superseded by the generic `SimpleQuerySubAgent`/`DualQuerySubAgent` patterns in the provider files. Confirm they're unreferenced, then delete:

- `balance-sub-agent.service.ts`
- `bundles-sub-agent.service.ts`
- `support-sub-agent.service.ts`
- `usage-sub-agent.service.ts`
- `topup-sub-agent.service.ts` (if superseded by `ActionSubAgent` in billing provider)

### 1.3 Fix Configuration Inconsistencies

| Item                                                            | Change                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| Move `INTENT_ROUTING_CONFIG` Symbol into `domain/tokens.ts`     | Align with project convention (all DI tokens in one file)          |
| Move `vite-plugin-pwa` from `dependencies` to `devDependencies` | It's a build tool, not runtime                                     |
| Add `engines` field to both `package.json` files                | `"node": ">=18"` to match ES2023 target                            |
| Fix CORS origins in `main.ts`                                   | Add `127.0.0.1:5173` (Playwright uses this) and extract to env var |
| Add `.unref()` to rate limiter's `setInterval`                  | Prevents blocking Node shutdown                                    |

### 1.4 Update AGENTS.md

Remove reference to nonexistent `intentClassifier.ts`. Update adapter descriptions to reflect that only `mock-telco-*` adapters remain.

---

## Phase 2 — TypeScript Strictness & Tooling (Low Risk, Medium Impact)

**Goal**: Bring backend TypeScript config to parity with the frontend and fix tooling gaps.

### 2.1 Enable Full Strict Mode in Backend

```jsonc
// backend/tsconfig.json
{
  "compilerOptions": {
    "strict": true, // replaces individual strictNullChecks, noImplicitAny, strictBindCallApply
    "target": "ES2023", // Node 18+ (enables Error.cause, Array.findLast, structuredClone)
    // ... rest unchanged
  },
}
```

This adds `strictPropertyInitialization`, `strictFunctionTypes`, `useUnknownInCatchVariables`, `noImplicitThis`, and `alwaysStrict`. Fix any new compiler errors — expect mostly `catch (e: unknown)` annotations and property initializer fixes.

### 2.2 Align TypeScript Versions

Update `backend/package.json` TypeScript from `^5.7.0` to `~5.9.3` to match frontend. Bump `@types/node` from `^22.0.0` to `^24.0.0`.

### 2.3 Add Backend ESLint

The backend has a `lint` script but no `eslint` devDependency. Add:

- `eslint` + `typescript-eslint` + flat config
- Share common rules with frontend where possible
- Add `@typescript-eslint/no-explicit-any` as error

### 2.4 Add Jest Coverage Thresholds

Add to backend `jest` config:

```json
"coverageThreshold": {
  "global": { "branches": 70, "functions": 80, "lines": 80, "statements": 80 }
}
```

---

## Phase 3 — Supervisor Decomposition (Medium Risk, High Impact)

**Goal**: Break up the 638-line `SupervisorService` God Object into focused, testable units.

### 3.1 Extract ToolValidationService

Move tool call validation logic out of SupervisorService:

```typescript
// application/supervisor/tool-validation.service.ts
class ToolValidationService {
  validateToolCall(
    toolCall: LlmToolCall,
  ): ValidatedToolCall | ToolValidationError;
  detectInstructionLeak(response: LlmChatResponse): boolean;
}
```

- `validateToolCallWithError()` → becomes `validateToolCall()` on the new service
- Instruction leak detection moves here too
- ~80 lines extracted

### 3.2 Extract ToolDegradationService

Move per-tool failure tracking out of SupervisorService:

```typescript
// application/supervisor/tool-degradation.service.ts
class ToolDegradationService {
  isDisabled(userId: string, toolName: string): boolean;
  recordFailure(userId: string, toolName: string): void;
  recordSuccess(userId: string, toolName: string): void;
  getEnabledToolDefinitions(
    userId: string,
    allTools: LlmToolDefinition[],
  ): LlmToolDefinition[];
}
```

- `toolFailureCounts` Map moves here
- Threshold/cooldown logic moves here
- Metrics recording for disabled/blocked/recovered moves here
- ~100 lines extracted

### 3.3 Extract ScreenCacheManager

Move cache orchestration logic (which screens are cacheable, invalidation rules on mutations):

```typescript
// application/supervisor/screen-cache-manager.service.ts
class ScreenCacheManager {
  tryCacheHit(userId: string, screenType: ScreenType): ScreenData | null;
  cacheResult(userId: string, screenType: ScreenType, data: ScreenData): void;
  invalidateOnMutation(userId: string, toolName: string): void;
}
```

- `CACHEABLE_SCREENS` set and invalidation map move here
- ~60 lines extracted

### 3.4 Provide CircuitBreakerService via DI

Currently `new`-ed inside the `AgentModule` factory. Instead:

```typescript
// In app.agent-module.ts providers:
{
  provide: CIRCUIT_BREAKER_PORT,  // new token in domain/tokens.ts
  useFactory: () => new CircuitBreakerService(),
}
```

Inject into SupervisorService as a port, making it mockable and replaceable.

### 3.5 Result

After extraction, SupervisorService should be ~350 lines focused on the core orchestration loop:

```
processRequest()
  → IntentRouter → ScreenCacheManager → CircuitBreaker gate
  → ContextManager → ReAct loop (LLM ↔ ToolValidation ↔ ToolResolver ↔ ToolDegradation)
  → Return response
```

---

## Phase 4 — DI & Module Wiring Cleanup (Medium Risk, Medium Impact)

**Goal**: Reduce the `AgentModule` factory complexity and make sub-agent registration declarative.

### 4.1 Reduce SupervisorService Constructor Parameters

After Phase 3 extractions, the supervisor's 12+ constructor parameters should drop to ~8. Group remaining BFF-unrelated deps into injected services rather than raw ports.

### 4.2 Declarative Sub-Agent Registration

Replace imperative `registerXxxAgents(supervisor, ...)` calls with a NestJS provider pattern:

```typescript
// Each provider exports an array of { token: toolName, agent: SubAgentPort }
// AgentModule collects all SUB_AGENT_REGISTRATION tokens
// SupervisorService iterates and registers in onModuleInit()
```

This decouples the module from knowing every sub-agent wiring detail.

### 4.3 Consolidate BFF Modules

The 4 BFF modules (`BalanceBffModule`, `BundlesBffModule`, `UsageBffModule`, `SupportBffModule`) are nearly identical — each imports `MockTelcoModule` and provides one `*_BFF_PORT → MockTelco*BffAdapter`. Consider a single `BffAdapterModule` with a factory for all four ports.

---

## Phase 5 — Migration & Data Layer Cleanup (Low Risk, Medium Impact)

**Goal**: Make the migration system maintainable and properly integrated.

### 5.1 Data-Driven Migration Runner

Replace the duplicated 5-migration if-else chain with a registry pattern:

```typescript
const MIGRATIONS: Migration[] = [
  {
    id: "001-conversations",
    up: (db) => {
      /* SQL */
    },
  },
  {
    id: "002-confirmation-screen",
    up: (db) => {
      /* SQL */
    },
  },
  // ...
];

for (const migration of MIGRATIONS) {
  if (!applied.has(migration.id)) {
    db.transaction(() => {
      migration.up(db);
      db.prepare("INSERT INTO _migrations ...").run(migration.id);
    })();
  }
}
```

Eliminates ~40 lines of duplication and makes adding future migrations trivial.

### 5.2 Inject Logger into SqliteConnectionService

Replace `console.log`/`console.error` with injected Pino logger for consistent structured logging.

### 5.3 Remove Constructor Side Effects

Move DB initialization from constructor to `onModuleInit()`:

```typescript
class SqliteConnectionService implements OnModuleInit {
  onModuleInit() {
    this.openDatabase();
    this.runMigrations();
  }
}
```

This makes the service testable without side effects on construction.

---

## Phase 6 — Frontend Modernization (Low Risk, Low-Medium Impact)

### 6.1 Add AbortController to agentService

Support request cancellation for streaming chat:

```typescript
sendMessage(request, { signal?: AbortSignal }) {
  const controller = new AbortController();
  fetch(url, { signal: controller.signal, ... });
  // Return controller for caller to abort
}
```

Wire into orchestrator machine so navigating away or starting a new request cancels the in-flight one.

### 6.2 Deduplicate XState Machine Actions

Extract shared context-reset logic:

```typescript
const createFreshContext = (): OrchestratorContext => ({
  // All default values in one place
});

// Both resetForNewSession and switchUser use:
assign(createFreshContext);
```

Remove duplicate default suggestion arrays (currently hardcoded in 3 places).

### 6.3 Extract AppShell Sub-Components

`AppShell.tsx` handles header, tabs, theme toggle, user switching, session list, and degraded banner. Extract:

- `AppHeader` — logo, theme toggle, user menu
- `SessionSidebar` — session list, new session button
- Keep `AppShell` as the layout compositor

### 6.4 Add Runtime Type Validation for API Responses

Both `agentService.ts` and `llmStatusService.ts` cast `response.json()` without validation. Add a lightweight validator (e.g., Zod or a manual type guard) for `AgentResponse` and `StatusResponse` shapes at the API boundary.

---

## Phase 7 — Observability & Operational Maturity (Low Risk, Low Impact)

### 7.1 Extend Correlation ID Middleware

Currently only applied to `agent/chat` routes. Apply to all `/api/*` routes so every request gets tracing.

### 7.2 Extract CORS Configuration

Move hardcoded CORS origins from `main.ts` to an env var (`CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`) validated in `env.validation.ts`.

### 7.3 Use ConfigService in Logger Module

`pino-logger.module.ts` reads `process.env.LOG_LEVEL` directly. Refactor to use `ConfigService` for consistency with the rest of the app.

---

## Implementation Order & Dependencies

```
Phase 1 (Dead Code)         ← No dependencies, start here
    │
Phase 2 (TypeScript/Tooling) ← Independent, can parallel with Phase 1
    │
Phase 3 (Supervisor Decomp)  ← Core refactor, most tests need updating
    │
Phase 4 (DI Cleanup)         ← Depends on Phase 3 (reduced constructor)
    │
Phase 5 (Data Layer)          ← Independent, can parallel with Phase 3/4
    │
Phase 6 (Frontend)            ← Independent, can parallel with anything
    │
Phase 7 (Observability)       ← Independent, can parallel with anything
```

**Critical path**: Phase 1 → Phase 3 → Phase 4

**Parallelizable**: Phases 2, 5, 6, 7 are independent of each other and of the critical path (after Phase 1).

---

## Risk Assessment

| Phase             | Risk     | Mitigation                                                             |
| ----------------- | -------- | ---------------------------------------------------------------------- |
| 1 — Dead Code     | Very Low | Build + test verification after each deletion                          |
| 2 — TypeScript    | Low      | `strict: true` may surface hidden bugs, but these are _existing_ bugs  |
| 3 — Supervisor    | Medium   | Extensive unit + e2e test coverage exists; extract-then-verify pattern |
| 4 — DI Wiring     | Medium   | Changes bootstrap behavior; full e2e suite validates                   |
| 5 — Migrations    | Low      | DB is disposable (auto-created); test with fresh DB                    |
| 6 — Frontend      | Low      | Behavior-preserving refactors; Playwright e2e validates                |
| 7 — Observability | Very Low | Additive changes only                                                  |

---

## What This Plan Does NOT Cover

- **ESM migration for backend**: NestJS 11 supports ESM, but the migration is complex (every import needs `.js` extension, Jest config overhaul, `reflect-metadata` compatibility). Recommend deferring until NestJS provides better ESM tooling.
- **Database replacement**: SQLite is appropriate for single-instance deployment. Moving to Postgres is a production concern, not a code quality concern.
- **Authentication**: The stub `AuthMiddleware` is intentional for this project stage. Real auth is a feature, not a refactor.
- **Framework upgrades**: All major deps (NestJS 11, React 19, Vite 8, XState 5) are already current.
