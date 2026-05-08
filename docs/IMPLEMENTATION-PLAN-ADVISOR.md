# Implementation Plan: Smart Plan Advisor

## Overview

Add a `get_plan_advice` tool that analyzes the user's current plan and usage patterns, then recommends better-fitting bundles with concrete savings calculations.

**Why:** High engagement feature — everyone wants to save money. Uses existing data (usage, account, bundles) but adds an analytics layer. Naturally bridges to bundle purchase flow.

**Scope:** 7 new files, 8 modified files, ~1,050 LOC.

---

## User Journey

```
User: "Am I getting good value for what I pay?"

Agent: "Let me analyze your usage patterns..."
  [Processing: Fetching usage, Analyzing patterns, Comparing plans]

Agent: "Here's what I found:

  You're on Prepaid Basic ($9.99/mo)
  • Data: 3.7/5 GB used (74%) — tight but ok
  • Voice: 175/200 min used (88%) — you're running out!
  • SMS: 44/200 used (22%) — lots of waste

  Recommendation: Upgrade to Value Plus ($19.99/mo)
  • You'd get 200 more minutes (you need them)
  • Same data allowance
  • Cost: +$10/mo but you'd avoid overage charges (~$15/mo in overages)
  • Net savings: ~$5/mo

  Want me to show you the Value Plus details?"

User: "Yes, show me"
  → view_bundle_details(b2)

User: "Let me think about it"
  → (no action, returns to idle)
```

---

## Architecture Changes

### New Domain Types

**File:** `backend/src/domain/types/plan-advisor.ts`

```typescript
export interface UsageAnalysis {
  userId: string;
  currentPlan: string;
  currentPlanPrice: number;
  period: string;
  metrics: UsageMetric[];
  overageRisk: OverageRisk[];
  waste: WasteMetric[];
}

export interface UsageMetric {
  type: 'data' | 'voice' | 'sms';
  used: number;
  total: number;
  unit: string;
  utilization: number;  // 0.0 - 1.0+
  status: 'under' | 'healthy' | 'tight' | 'over';
}

export interface OverageRisk {
  type: 'data' | 'voice' | 'sms';
  remaining: number;
  dailyBurnRate: number;
  daysUntilExhaustion: number | null;
  projectedOverage: number;
}

export interface WasteMetric {
  type: 'data' | 'voice' | 'sms';
  unused: number;
  unit: string;
  wastedValue: number;
}

export interface PlanRecommendation {
  bundleId: string;
  bundleName: string;
  price: number;
  priceDiff: number;
  savings: number;
  reasons: string[];
  score: number;  // 0-100
}
```

### New Domain Service

**File:** `backend/src/domain/services/plan-advisor.service.ts`

Pure business logic — no framework dependencies.

```typescript
export class PlanAdvisorService {
  // Utilization thresholds
  private static readonly UTILIZATION_THRESHOLDS = {
    under: 0.5,    // <50% — significant waste
    healthy: 0.8,  // 50-80% — good fit
    tight: 1.0,    // 80-100% — running close
    // >100% — over
  };

  // Overage rates ($/unit)
  private static readonly OVERAGE_RATES = {
    data: 5.00,    // $5/GB
    voice: 0.10,   // $0.10/min
    sms: 0.05,     // $0.05/SMS
  };

  analyzeUsage(usage: UsageEntry[], account: TelcoAccount): UsageAnalysis;
  calculateOverageRisk(usage: UsageEntry[], billingCycleEnd: string): OverageRisk[];
  calculateWaste(usage: UsageEntry[]): WasteMetric[];
  scoreBundles(analysis: UsageAnalysis, bundles: Bundle[]): PlanRecommendation[];
  generateReasons(rec: PlanRecommendation, analysis: UsageAnalysis): string[];
}
```

**Scoring algorithm:**
- Base score (0-100) per bundle based on how well it covers the user's usage
- Penalize for waste (unused allowance × estimated $ value)
- Reward for overage elimination (projected overage savings)
- Penalize for price difference (but offset by savings)
- Sort by score descending, return top 3

### New Tool

**File:** `backend/src/domain/constants/tool-registry.ts` — add entry:

```typescript
get_plan_advice: {
  name: "get_plan_advice",
  screenType: "planAdvisor",
  allowedArgs: ["userId"],
  replyText: "Here's my analysis of your current plan and recommendations.",
  suggestions: ["Switch to recommended plan", "Show me details", "Check my usage"],
  description: "Analyze the user's current plan and usage to recommend better plans. Use when the user asks about value, saving money, plan optimization, or whether they're on the right plan.",
  parameters: {
    type: "object",
    properties: {
      userId: { type: "string", description: "The user ID" },
    },
    required: ["userId"],
  },
},
```

### New Intent

**File:** `backend/src/domain/types/intent.ts`

```typescript
export enum TelecomIntent {
  // ... existing
  GET_PLAN_ADVICE = 'get_plan_advice',
}

export type Tier1Intent =
  | TelecomIntent.CHECK_BALANCE
  | TelecomIntent.CHECK_USAGE
  | TelecomIntent.BROWSE_BUNDLES
  | TelecomIntent.GET_SUPPORT
  | TelecomIntent.ACCOUNT_SUMMARY
  | TelecomIntent.GET_PLAN_ADVICE;  // NEW

export const INTENT_KEYWORDS: IntentKeywordMap = {
  // ... existing
  [TelecomIntent.GET_PLAN_ADVICE]: [
    'best plan', 'save money', 'good value', 'right plan',
    'plan recommendation', 'am I overpaying', 'optimize my plan', 'should I switch',
  ],
};
```

**File:** `backend/data/intent-keywords.json` — add:

```json
"get_plan_advice": [
  "best plan", "save money", "good value", "right plan",
  "plan recommendation", "am I overpaying", "optimize my plan", "should I switch"
]
```

### New Screen Type

**File:** `backend/src/domain/types/agent.ts`

```typescript
export type ScreenType =
  // ... existing
  | "planAdvisor";

export interface PlanAdvisorScreenData {
  type: "planAdvisor";
  analysis: UsageAnalysis;
  recommendations: PlanRecommendation[];
  currentBalance: Balance;
}
```

### New Sub-Agent

**File:** `backend/src/application/sub-agents/plan-advisor-sub-agent.service.ts`

```typescript
export class PlanAdvisorSubAgent implements SubAgentPort {
  constructor(
    private readonly telco: MockTelcoService,
    private readonly advisor: PlanAdvisorService,
  ) {}

  async handle(userId: string): Promise<{ screenData; processingSteps }> {
    const account = this.telco.getAccount(userId);
    const usage = this.telco.getUsage(userId);
    const bundles = this.telco.getBundleCatalog();

    const analysis = this.advisor.analyzeUsage(usage, account);
    const recommendations = this.advisor.scoreBundles(analysis, bundles);
    const currentBalance = this.telco.getBalance(userId);

    return {
      screenData: { type: "planAdvisor", analysis, recommendations, currentBalance },
      processingSteps: [
        { label: "Fetching usage", status: "done" },
        { label: "Analyzing patterns", status: "done" },
        { label: "Comparing plans", status: "done" },
      ],
    };
  }
}
```

### Registration

**File:** `backend/src/application/sub-agents/account-agents.provider.ts` — add:

```typescript
{
  toolName: "get_plan_advice",
  agent: new PlanAdvisorSubAgent(telcoService, planAdvisorService),
}
```

**File:** `backend/src/app.agent-module.ts` — wire `PlanAdvisorService` and register sub-agent.

### Mock Telco Enhancement

**File:** `backend/src/infrastructure/telco/mock-telco.service.ts` — add:

```typescript
getDailyBurnRate(userId: string): { dataMbPerDay: number; minutesPerDay: number; smsPerDay: number } {
  // Calculate from telco_usage_records for current billing cycle
  // daysElapsed = now - billing_cycle_start
  // burnRate = total_used / daysElapsed
}

getBillingCycleProgress(userId: string): { daysElapsed: number; daysRemaining: number; progress: number } {
  // Calculate where user is in billing cycle
}
```

### Frontend Screen

**File:** `src/screens/PlanAdvisorScreen/PlanAdvisorScreen.tsx`

Components:
- **CurrentPlanCard** — current plan, price, utilization bars with status colors
- **UsageBreakdown** — data/voice/SMS with green/yellow/red indicators
- **OverageRiskBanner** — warning if user will run out before cycle end
- **WasteIndicator** — "You're paying for 156 SMS you'll never use"
- **RecommendationList** — ranked cards with score badge, price diff, savings, reasons
- **ActionButtons** — "Switch to recommended", "View details", "Not now"

**File:** `src/screens/registry.ts` — register `PlanAdvisorScreen`.

**File:** `src/types/screens.ts` — add `PlanAdvisorScreenData` type.

### System Prompt Update

**File:** `backend/src/application/supervisor/system-prompt.ts` — add:

```
- get_plan_advice: Analyze the user's current plan and usage to recommend better plans.
  Use when the user asks about value, saving money, plan optimization, or whether they're
  on the right plan. Returns analysis with top 3 recommendations ranked by match score.
```

---

## Files Changed

| File | Action |
|---|---|
| `backend/src/domain/types/plan-advisor.ts` | **NEW** |
| `backend/src/domain/services/plan-advisor.service.ts` | **NEW** |
| `backend/src/application/sub-agents/plan-advisor-sub-agent.service.ts` | **NEW** |
| `backend/src/domain/types/intent.ts` | Modify — add GET_PLAN_ADVICE |
| `backend/src/domain/types/agent.ts` | Modify — add planAdvisor screen type |
| `backend/src/domain/constants/tool-registry.ts` | Modify — add get_plan_advice tool |
| `backend/data/intent-keywords.json` | Modify — add plan_advice keywords |
| `backend/src/application/sub-agents/account-agents.provider.ts` | Modify — register sub-agent |
| `backend/src/app.agent-module.ts` | Modify — wire service |
| `backend/src/infrastructure/telco/mock-telco.service.ts` | Modify — add burn rate methods |
| `backend/src/application/supervisor/system-prompt.ts` | Modify — add tool description |
| `src/screens/PlanAdvisorScreen/PlanAdvisorScreen.tsx` | **NEW** |
| `src/screens/PlanAdvisorScreen/PlanAdvisorScreen.module.css` | **NEW** |
| `src/screens/registry.ts` | Modify — register screen |
| `src/types/screens.ts` | Modify — add type |
| `backend/src/domain/services/plan-advisor.service.spec.ts` | **NEW** |
| `e2e/plan-advisor.spec.ts` | **NEW** |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Recommendation quality depends on algorithm | Start simple (utilization-based), iterate with real data |
| User trust — must show the math | Display utilization %, burn rate, projected overage explicitly |
| Performance on large usage_records tables | Add index on `telco_usage_records(user_id, timestamp)` |
| Never auto-switch plans | Always require explicit confirmation via existing gated flow |
| Algorithm edge cases (unlimited plans, -1 values) | Handle -1 (unlimited) as 9999 in calculations |
