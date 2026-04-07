# SPEC: My Account Dashboard

## Objective

Add an **account dashboard screen** to the telecom agent PWA that gives users a unified, read-only view of their telco relationship. When the user says "show my account" or "my dashboard", the agent responds with a rich screen showing their profile, active subscriptions, recent transactions, and ticket statuses — all data that already exists in the mock telco backend but is currently invisible.

**Target users**: Demo audience evaluating the AI-powered telecom agent concept.

**Acceptance criteria**:
1. User can ask "show my account" and get a single screen with four sections
2. Account profile section shows name, MSISDN, plan, balance, billing cycle dates
3. Active subscriptions section lists owned bundles with per-bundle consumption (data/voice/SMS used vs total) and expiry countdown
4. Transaction history section shows last 5 actions (purchases, top-ups, ticket creations) with timestamps
5. Ticket tracker section shows open/in-progress tickets with status badges and last-updated time
6. The screen is read-only — no inline action buttons
7. Existing flows (balance, bundles, usage, support, purchase) are completely unaffected
8. All 108 existing backend tests continue to pass

## Commands

### New Backend Tool

**Tool name**: `get_account_summary`

**Behavior**: Aggregates data from 4 telco tables into a single response:
- `telco_accounts` → profile info
- `telco_subscriptions` (active, joined with `telco_bundles_catalog`) → active subscriptions
- `telco_subscriptions` + `telco_tickets` (ordered by most recent) → transaction history
- `telco_tickets` (non-resolved) → ticket tracker

**Screen type**: `account`

**LLM routing**: Triggered by prompts like "show my account", "my dashboard", "account overview", "my profile"

### New Frontend Screen

**Component**: `AccountScreen`

**Layout**: Four cards/sections stacked vertically, scrollable:

```
┌─────────────────────────────────────┐
│  Account Profile                     │
│  Name: Alex Morgan                   │
│  Phone: +1 202 555 1234             │
│  Plan: Prepaid Basic                 │
│  Balance: $45.01                     │
│  Billing: Apr 1 – Apr 30            │
├─────────────────────────────────────┤
│  Active Subscriptions               │
│  ┌─────────────────────────────────┐│
│  │ Starter Pack     expires May 5  ││
│  │ Data  0.9/2 GB    ████░░░░░░    ││
│  │ Voice 49/100 min  █████░░░░░    ││
│  │ SMS   13/50       ███░░░░░░░    ││
│  └─────────────────────────────────┘│
│  (empty state if no subscriptions)  │
├─────────────────────────────────────┤
│  Recent Activity                    │
│  Apr 7  Purchased Starter Pack      │
│  Apr 6  Top-up $10.00              │
│  Apr 5  Ticket created TK-1024      │
│  ...                                │
├─────────────────────────────────────┤
│  Open Tickets                       │
│  TK-1024  ● In Progress            │
│           Data connectivity issues  │
│           Updated Apr 6             │
│  TK-1019  ● Open                   │
│           Incorrect billing         │
│           Updated Apr 5             │
└─────────────────────────────────────┘
```

## Project Structure

### New Files

| File | Purpose |
|------|---------|
| `backend/src/application/sub-agents/account-summary-sub-agent.service.ts` | New sub-agent aggregating account data |
| `src/screens/AccountScreen/AccountScreen.tsx` | Dashboard screen component |
| `src/screens/AccountScreen/AccountScreen.module.css` | Dashboard styles |

### Modified Files

| File | Change |
|------|--------|
| `backend/src/domain/constants/agent-constants.ts` | Add `get_account_summary` to tool registry |
| `backend/src/application/supervisor/tool-definitions.ts` | Auto-generated from registry (if not already) |
| `backend/src/infrastructure/telco/mock-telco.service.ts` | Add `getAccountSummary()` method |
| `backend/src/app.agent-module.ts` | Register new sub-agent |
| `src/screens/registry.ts` | Add `account` → `AccountScreen` mapping |
| `src/types/agent.ts` | Add `AccountScreenData` to `ScreenData` union + `ScreenType` |
| `src/types/screens.ts` | Add screen registry type if needed |

## Code Style

- Follow existing patterns exactly: `SimpleQuerySubAgent` or `DualQuerySubAgent` for the backend sub-agent
- Screen component follows same pattern as `UsageScreen` / `SupportScreen` — receives `data` prop, renders cards
- CSS Modules with existing design tokens (colors, spacing, typography)
- TypeScript strict — all new types explicitly defined in `types/agent.ts`
- No new npm dependencies

## Testing Strategy

- **Backend**: Unit test for `MockTelcoService.getAccountSummary()` — verify aggregation of all 4 sections
- **Backend**: Existing 108 tests must still pass (no regressions)
- **Frontend**: No frontend test infrastructure exists yet — skip per project convention
- **Manual verification**: Delete DB → fresh seed → ask agent "show my account" → verify all 4 sections render with correct data

## Boundaries

### Always do
- Reuse existing `MockTelcoService` methods where possible — add one new aggregation method
- Follow the existing tool registry pattern for the new tool
- Keep the screen read-only — no action buttons, no form inputs
- Use existing CSS design tokens for all styling
- Add the new `ScreenType` to the discriminated union in `types/agent.ts`

### Ask first about
- Adding new telco tables or columns (don't assume schema changes are needed)
- Changing existing screen layouts or shared components

### Never do
- Modify existing sub-agents, tools, or screen components
- Add authentication or authorization logic
- Introduce new npm packages
- Add real payment processing
- Break the existing chat-driven interaction pattern
