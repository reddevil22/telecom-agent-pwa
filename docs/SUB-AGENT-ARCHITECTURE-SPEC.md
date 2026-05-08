# Sub-Agent Architecture Improvements — Specification

## Context

Following an architectural review of the backend agentic loop, several improvements were identified to strengthen the sub-agent design for production readiness. This document captures the recommended changes and their rationale.

## Status

Draft — pending implementation

---

## Recommendation 1: Add sessionId to SubAgentPort

### Problem

`SubAgentPort.handle(userId, params?)` doesn't receive the full `AgentRequest` context. Sub-agents that need `sessionId` (e.g., for caching, state management, or logging) must tunnel it through `params`, which is fragile and semantically wrong.

### Proposed Change

```typescript
// Before
interface SubAgentPort {
  handle(userId: string, params?: Record<string, string>): Promise<SubAgentResult>;
}

// After
interface SubAgentPort {
  handle(
    userId: string,
    sessionId: string,
    params?: Record<string, string>
  ): Promise<SubAgentResult>;
}
```

### Impact

- All existing sub-agents must add `sessionId` parameter (no implementation change, just signature update).
- `SupervisorService.executeSubAgentCore` and `SupervisorService.executeSubAgent` must pass `request.sessionId`.
- ToolResolver registrations unchanged — only the `handle()` call site changes.
- Generic sub-agents (`SimpleQuerySubAgent`, `DualQuerySubAgent`, `ActionSubAgent`) pass `sessionId` to their BFF methods if needed.

### Files Affected

- `backend/src/domain/ports/sub-agent.port.ts`
- `backend/src/application/sub-agents/generic-sub-agents.ts`
- `backend/src/application/sub-agents/purchase-bundle-sub-agent.service.ts`
- `backend/src/application/sub-agents/data-gift-sub-agent.service.ts`
- `backend/src/application/sub-agents/create-ticket-sub-agent.service.ts`
- `backend/src/application/sub-agents/view-bundle-details-sub-agent.service.ts`
- `backend/src/application/supervisor/supervisor.service.ts`

---

## Recommendation 2: Document Tool-to-SubAgent Mapping

### Problem

The relationship between tool names (from `tool-definitions.ts`) and the sub-agents that handle them is implicit via `ToolResolver`. A new developer must trace `tool-definitions.ts` → `ToolResolver` → provider factory → sub-agent class to understand the routing.

### Proposed Change

Add a registry table to `AGENTS.md` (or create `backend/docs/TOOL_AGENT_REGISTRY.md`):

```markdown
## Tool → SubAgent Registry

| Tool Name           | SubAgent Class                  | Provider                 | Tier |
|---------------------|--------------------------------|--------------------------|------|
| `check_balance`     | `SimpleQuerySubAgent`          | `account-agents.provider.ts` | 1  |
| `get_account_summary` | `DualQuerySubAgent`           | `account-agents.provider.ts` | 1  |
| `check_usage`       | `DualQuerySubAgent`            | `account-agents.provider.ts` | 1  |
| `list_bundles`      | `SimpleQuerySubAgent`          | `bundle-agents.provider.ts`  | 1  |
| `view_bundle_details` | `ViewBundleDetailsSubAgent`  | `bundle-agents.provider.ts`  | 1  |
| `purchase_bundle`   | `PurchaseBundleSubAgent`       | `bundle-agents.provider.ts`  | 3  |
| `top_up`            | `ActionSubAgent<TopUpParams>`   | `billing-agents.provider.ts` | 1  |
| `get_support`       | `SimpleQuerySubAgent`          | `support-agents.provider.ts` | 1  |
| `create_ticket`     | `CreateTicketSubAgent`         | `support-agents.provider.ts`  | 3  |
| `share_data`        | `DataGiftSubAgent`             | `data-gift-agents.provider.ts` | 1  |
```

Also document that:
- **Tier 1 tools** bypass LLM and route directly via IntentRouter
- **Tier 3 tools** go through LLM ReAct loop
- Tool definitions are auto-generated from `tool-registry.ts` via `tool-definitions.ts`

### Files Affected

- `AGENTS.md` — add registry table
- Or create `backend/docs/TOOL_AGENT_REGISTRY.md` if documentation grows large

---

## Recommendation 3: SubAgentResult with explicit ValidationResult

### Problem

When `DataGiftSubAgent` validates arguments (recipient found, amount parseable, allowance sufficient), validation failures return a full `SubAgentResult` with `type: "dataGift", status: "error"`. This conflates two concerns:
1. Valid arguments that produce an error screen (business logic failure)
2. Invalid arguments that should be rejected before execution

### Proposed Change

Introduce a discriminated union for sub-agent outcomes:

```typescript
// Option A: Keep current pattern but name it clearly
type SubAgentOutcome =
  | { kind: "screen"; screenData: ScreenData; processingSteps: ProcessingStep[] }
  | { kind: "validation-error"; message: string; step: ProcessingStep[] };

// Option B: Add a `validationResult` wrapper that Supervisor interprets
interface ValidationResult {
  valid: boolean;
  errorMessage?: string;
  // ... extracted + normalized params
}
```

**Decision: Option A (outcomes discriminated by `kind`) is cleaner.**

```typescript
interface SubAgentResult {
  screenData: ScreenData;
  processingSteps: ProcessingStep[];
}

interface SubAgentOutcome {
  success: SubAgentResult;
  validationError: { message: string; processingSteps: ProcessingStep[] };
  executionError: SubAgentResult; // already has error status
}

// SubAgentPort becomes:
interface SubAgentPort {
  handle(userId: string, sessionId: string, params?: Record<string, string>): Promise<SubAgentOutcome>;
}
```

### Impact

- `SupervisorService` would handle `validationError` by returning it as a confirmation screen (not an error screen) with a helpful message.
- `DataGiftSubAgent` validation logic would be split into a separate `validateArgs()` method.
- Error handling becomes more intentional — validation failures are distinct from execution failures.

### Alternative Consideration

If the current error-screen pattern works adequately in practice, this change may be **low priority**. The existing flow is functional, just slightly imprecise in its terminology.

---

## Recommendation 4: Extract DataGiftSubAgent responsibilities

### Problem

`DataGiftSubAgent.handle()` does four distinct things:
1. Resolve recipient (`bff.resolveRecipient`)
2. Parse amount (`parseAmount()` regex)
3. Validate allowance (`bff.validateAllowance`)
4. Transfer data (`bff.transferData`)

The amount parsing regex is duplicated in `supervisor.service.ts:1010` (`buildDataGiftConfirmation`).

### Proposed Change

Split into:

```typescript
// DataGiftArgsParser
class DataGiftArgsParser {
  parseAmount(raw: string): { mb: number; valid: boolean } // extracts regex, unit conversion
  parseRecipient(query: string): { query: string } // just passes through for now
}

// DataGiftValidator
class DataGiftValidator {
  constructor(private bff: DataGiftBffPort) {}
  async validate(userId: string, amountMb: number): Promise<ValidationResult>
  async resolveRecipient(userId: string, recipientQuery: string): Promise<Recipient | null>
}

// DataGiftExecutor
class DataGiftExecutor {
  constructor(private bff: DataGiftBffPort) {}
  async execute(userId: string, recipientUserId: string, amountMb: number): Promise<TransferResult>
}

// DataGiftSubAgent orchestrates
class DataGiftSubAgent implements SubAgentPort {
  constructor(
    private argsParser: DataGiftArgsParser,
    private validator: DataGiftValidator,
    private executor: DataGiftExecutor,
  ) {}
}
```

This also allows reuse of `DataGiftArgsParser.parseAmount()` in the Supervisor's `buildDataGiftConfirmation`.

### Impact

- Breaks tight coupling in `DataGiftSubAgent`
- Enables unit testing of parsing logic independently
- Amount parsing regex lives in one place (`DataGiftArgsParser`)
- Supervisor's `buildDataGiftConfirmation` can reuse the parser

### Files Affected

- `backend/src/application/sub-agents/data-gift-sub-agent.service.ts` — refactor into multiple classes
- `backend/src/application/supervisor/supervisor.service.ts` — use shared `DataGiftArgsParser` for amount formatting

---

## Recommendation 5: Rename "ReAct loop" to "LLM-guided tool dispatch"

### Problem

`supervisor.service.ts` comments say "ReAct loop" but the loop exits after the first successful tool call. A true ReAct loop would allow multiple tool calls per request (iteration → tool → result → next iteration → ...).

### Proposed Change

1. Rename comments from "ReAct loop" to "LLM-guided single tool dispatch" or "LLM tool dispatch loop"
2. Document that the max-iteration safety net exists for cases where:
   - LLM returns no tool call
   - Tool validation fails
   - Sub-agent execution fails

In these cases, the loop retries with the error fed back into context messages.

3. Add explicit naming:
   ```typescript
   // LLM tool dispatch loop — single tool per request (safety loop for retries)
   for (let iteration = 0; iteration < SECURITY_LIMITS.SUPERVISOR_MAX_ITERATIONS; iteration++) {
   ```

### Impact

- Zero code changes, only comments and variable names
- Clarifies actual behavior for future maintainers

### Files Affected

- `backend/src/application/supervisor/supervisor.service.ts` — comment updates only

---

## Recommendation 6: Add SubAgentPort tests

### Problem

No unit tests exist for `SubAgentPort` implementations (only integration tests via `SupervisorService`).

### Proposed Change

Add unit tests for each sub-agent:

```typescript
// generic-sub-agents.spec.ts
describe('SimpleQuerySubAgent', () => {
  it('should return screenData with transformed result')
  it('should propagate BFF errors')
})

describe('ActionSubAgent', () => {
  it('should return validation error when params invalid')
  it('should return success screen on valid execution')
})

describe('DualQuerySubAgent', () => {
  it('should parallel-call both BFF methods')
})

// purchase-bundle-sub-agent.service.spec.ts
describe('PurchaseBundleSubAgent', () => {
  it('should return error screen when bundleId missing')
  it('should pass through purchaseBundle result')
})

// data-gift-sub-agent.service.spec.ts
describe('DataGiftSubAgent', () => {
  it('should return error when recipient not found')
  it('should return error when amount unparseable')
  it('should return error when allowance insufficient')
  it('should return success on valid transfer')
})
```

### Files Affected

- `backend/src/application/sub-agents/*.spec.ts` — existing spec files need implementations
- `backend/src/application/sub-agents/generic-sub-agents.spec.ts` — currently empty or minimal

---

## Priority and Ordering

| # | Recommendation | Priority | Effort |
|---|---------------|----------|--------|
| 1 | Add sessionId to SubAgentPort | High | Medium |
| 2 | Document tool-to-subagent mapping | Medium | Low |
| 3 | SubAgentResult with explicit ValidationResult | Low | Medium |
| 4 | Extract DataGiftSubAgent responsibilities | Medium | Medium |
| 5 | Rename "ReAct loop" comments | Low | Trivial |
| 6 | Add SubAgentPort unit tests | Medium | Medium |

**Recommended order:** 2 → 5 → 4 → 1 → 6 → 3

- **2 and 5 are documentation/naming** — do first with no risk
- **4 extracts shared logic** — needed before 1 modifies the interface
- **1 changes the SubAgentPort signature** — do after 4 so only one migration
- **6 adds test coverage** — should follow implementation of 1 and 4
- **3 is lowest value** — current pattern works; deprioritize

---

## Open Questions

1. Should `ToolResolver` be a class with a `register()` method, or remain as a simple Map with a factory function? Current implementation is a plain Map — is that sufficient?

2. Should gated tool confirmation (`pendingConfirmations` map in Supervisor) be moved into a dedicated `ConfirmationService`? Currently it's stateful in Supervisor which couples confirmation logic to the orchestration layer.

3. Should Tier 1 routed tools (via IntentRouter) go through the same `SubAgentPort.handle()` signature as Tier 3? Currently they do — but Tier 1 bypasses LLM entirely. Does this need to be reflected architecturally?