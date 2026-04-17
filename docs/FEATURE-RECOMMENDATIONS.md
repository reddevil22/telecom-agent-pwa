# Feature Recommendations: Telecom Domain Expansion

Features that deepen the telecom domain coverage and showcase advanced agentic patterns beyond basic CRUD. Each feature includes motivation, architecture fit, implementation sketch, and priority assessment.

---

## 1. Proactive Notifications & Usage Alerts

### Motivation

Current UX is entirely reactive — the user must ask every question. Real telecom apps push alerts for usage thresholds, bundle expiry, and payment reminders. Proactive behavior shifts the agent from a query tool to an intelligent assistant.

### User Stories

- "You've used 80% of your 5GB data allowance. Consider upgrading to Unlimited Pro."
- "Your Value Plus bundle expires in 3 days. Renew now?"
- "Payment of $29.99 is due in 5 days. Would you like to set up auto-pay?"
- "Your data speed has been throttled. Top up to restore full speed."

### Architecture Fit

- **Backend**: Add a `NotificationSchedulerService` in `infrastructure/telco/` that runs on a configurable interval (`TELCO_SIMULATION_INTERVAL_MS` already exists). Queries usage records and bundle subscriptions, evaluates threshold rules, and emits notification events.
- **Delivery**: Push notifications to connected SSE clients via a new `event: notification` type on the stream endpoint. Falls back to showing notifications on next `/chat` request for non-streaming clients.
- **Frontend**: New `NotificationBanner` component in AppShell (above chat area). Notification carries a suggested action (e.g., "Top up" button) that feeds back into the orchestrator as a pre-filled prompt.
- **Intent routing**: No new intent needed — notification actions map to existing tools (`top_up`, `purchase_bundle`).

### New Artifacts

| File                                                                 | Purpose                                                     |
| -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `backend/src/infrastructure/telco/notification-scheduler.service.ts` | Threshold evaluation + event emission                       |
| `backend/src/domain/types/notification.ts`                           | `NotificationType` enum, `Notification` interface           |
| `backend/src/domain/constants/notification-rules.ts`                 | Configurable threshold rules (80% data, 3-day expiry, etc.) |
| `src/components/NotificationBanner/`                                 | Dismissible alert with action button                        |

### Complexity

Medium — ~8 hours. The scheduler and SSE emission are straightforward; the UX for stacking/dismissing multiple notifications needs design.

### Priority: **High**

Demonstrates the #1 differentiator of an agentic app over a static dashboard: anticipatory behavior.

---

## 2. Natural Language Bill Explanation

### Motivation

Telecom bills are notoriously confusing — line items like "partial month proration", "regulatory recovery fee", and "device installment credit" frustrate customers. This is a high-value, low-risk LLM use case: take structured billing data and generate a plain-English explanation.

### User Stories

- "Explain my bill" → Agent fetches itemized charges and produces a readable summary
- "Why is my bill $15 more than last month?" → Agent compares current vs. previous bill, highlights changes
- "What's this $4.99 charge?" → Agent identifies the specific line item and explains it

### Architecture Fit

- **New sub-agent**: `BillExplanationSubAgent` — fetches billing data from BFF, passes itemized charges to LLM with a summarization prompt, returns narrative text alongside a structured bill breakdown
- **Intent routing**: New `TelecomIntent.EXPLAIN_BILL` — Tier 1 keywords: `bill`, `invoice`, `charges`, `billing`, `explain my bill`, `why is my bill`
- **Screen**: New `BillScreen` with two views: (1) structured table of line items, (2) LLM-generated explanation paragraph
- **LLM usage**: This is intentionally a Tier 3 intent — the LLM adds genuine value by explaining charges in conversational language

### New Artifacts

| File                                                                       | Purpose                                                         |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `backend/src/infrastructure/telco/`                                        | Billing data in mock telco (monthly charges, line items, taxes) |
| `backend/src/application/sub-agents/bill-explanation-sub-agent.service.ts` | Fetches billing + LLM summarization                             |
| `src/screens/BillScreen/`                                                  | Itemized table + narrative explanation                          |
| `backend/data/intent-keywords.json`                                        | Add `EXPLAIN_BILL` keywords                                     |

### Mock Data Shape

```json
{
  "billDate": "2026-04-01",
  "dueDate": "2026-04-25",
  "totalAmount": 67.48,
  "previousBalance": 52.99,
  "lineItems": [
    { "description": "Unlimited Pro Plan", "amount": 49.99 },
    { "description": "Device installment (iPhone 16)", "amount": 12.5 },
    { "description": "Regulatory recovery fee", "amount": 1.99 },
    { "description": "State tax", "amount": 3.0 }
  ]
}
```

### Complexity

Medium — ~6 hours. Most effort is in the new screen UI and mock data seeding.

### Priority: **High**

Bill confusion is the #1 driver of telecom support calls. This directly demonstrates LLM value-add.

---

## 3. Plan Comparison & Recommendation Engine

### Motivation

"Which bundle is best for me?" requires multi-source reasoning: usage history + bundle catalog + cost optimization. This showcases the agent's ability to synthesize data and make personalized recommendations — beyond simple data retrieval.

### User Stories

- "Which plan is best for me?" → Agent analyzes last 3 months of usage, compares against all bundles, recommends the best fit
- "Compare Starter Pack and Value Plus" → Side-by-side comparison with usage-based verdict
- "Am I on the right plan?" → Agent checks if current bundle covers actual usage patterns
- "I want to save money" → Agent finds the cheapest plan that covers current usage

### Architecture Fit

- **New sub-agent**: `PlanRecommendationSubAgent` — queries usage history + bundle catalog + current subscription, constructs a comparison context, passes to LLM for recommendation
- **Intent routing**: New `TelecomIntent.RECOMMEND_PLAN` — Tier 3 only (requires LLM reasoning). Tier 1 keywords: `recommend`, `best plan`, `compare plans`, `right plan`, `save money on plan`
- **Screen**: New `PlanComparisonScreen` with comparison cards, usage fit indicators, and a highlighted recommendation
- **LLM prompt**: Structured template with usage stats and bundle details — LLM generates the recommendation rationale

### New Artifacts

| File                                                                          | Purpose                                      |
| ----------------------------------------------------------------------------- | -------------------------------------------- |
| `backend/src/application/sub-agents/plan-recommendation-sub-agent.service.ts` | Multi-query + LLM reasoning                  |
| `src/screens/PlanComparisonScreen/`                                           | Side-by-side cards with recommendation badge |
| `backend/src/domain/types/intent.ts`                                          | Add `RECOMMEND_PLAN` to `TelecomIntent`      |

### Complexity

Medium-High — ~10 hours. The LLM prompt engineering for consistent recommendation quality is the main challenge.

### Priority: **Medium-High**

Strong POC value — demonstrates agent reasoning beyond simple CRUD retrieval.

---

## 4. Multi-Turn Troubleshooting Flows

### Motivation

Current architecture returns after a single tool call. Real telecom support often requires guided, multi-step troubleshooting: diagnose → test → escalate. This feature pushes the ReAct loop to its intended multi-turn capability.

### User Stories

- "My internet is slow" → Agent asks about device type → runs speed test (mock) → suggests restart → offers to create ticket if unresolved
- "I can't make calls" → Agent checks account status → verifies no outage → suggests SIM reset → escalates
- "My data isn't working" → Agent checks data balance → verifies APN settings → tests connectivity → recommends action

### Architecture Fit

- **Conversation state**: Extend the supervisor to support multi-turn tool sequences. Instead of returning after the first tool call, the agent can return a `followUp` field indicating more information is needed.
- **New sub-agent**: `TroubleshootingSubAgent` — state machine-based (or decision tree) that tracks diagnosis progress per session
- **Intent routing**: New `TelecomIntent.TROUBLESHOOT` — Tier 3 only. Keywords: `slow`, `not working`, `can't connect`, `no signal`, `problem`, `issue`, `fix`
- **Screen**: New `DiagnosticsScreen` with step-by-step progress, test results, and action buttons at each stage

### Interaction Flow

```
User: "My internet is slow"
Agent: [DiagnosticsScreen - Step 1]
  "Let me help troubleshoot. What device are you using?"
  [Button: Phone] [Button: Laptop] [Button: Router]

User: clicks "Phone"
Agent: [DiagnosticsScreen - Step 2]
  "Running speed test..."
  → Result: 2.1 Mbps (expected: 25 Mbps)
  "Speed is below expected. Try: 1) Toggle airplane mode 2) Restart phone"
  [Button: Still slow] [Button: Fixed!]

User: clicks "Still slow"
Agent: [DiagnosticsScreen - Step 3]
  "I'll check for network issues in your area..."
  → No outage detected
  "Creating a support ticket for further investigation."
  → [ConfirmationScreen: Ticket #TK-XXX created]
```

### New Artifacts

| File                                                                      | Purpose                                       |
| ------------------------------------------------------------------------- | --------------------------------------------- |
| `backend/src/application/sub-agents/troubleshooting-sub-agent.service.ts` | Multi-step diagnostic flow                    |
| `backend/src/infrastructure/telco/diagnostics.service.ts`                 | Mock speed test, outage check, network status |
| `src/screens/DiagnosticsScreen/`                                          | Step progress, results, action buttons        |
| `backend/src/domain/types/diagnostics.ts`                                 | Diagnostic step types, result interfaces      |

### Complexity

High — ~12 hours. Requires extending the single-screen-per-request paradigm to support conversational flows with intermediate screens.

### Priority: **Medium**

High demo value for showcasing multi-turn agentic behavior, but requires the most architectural change.

---

## 5. SIM Swap & eSIM Management

### Motivation

SIM operations are a top call-center cost driver. Self-service SIM swap, eSIM activation, and eSIM transfer demonstrate the agent handling sensitive operations with identity verification guardrails — a key enterprise concern for AI agents.

### User Stories

- "I need a new SIM card" → Agent verifies identity → initiates SIM swap → provides activation instructions
- "Activate my eSIM" → Agent provides QR code (mock) + setup instructions
- "Transfer my number to a new phone" → Guided eSIM transfer flow
- "My SIM was stolen" → Emergency SIM lock + replacement request

### Architecture Fit

- **Security layer**: SIM operations require an additional verification step (mock PIN or security question). Adds a `VerificationSubAgent` that must succeed before the SIM operation proceeds.
- **New sub-agents**: `SimSwapSubAgent`, `EsimActivationSubAgent`
- **Intent routing**: New `TelecomIntent.SIM_MANAGEMENT` — Tier 3 (entity extraction for operation type). Keywords: `SIM`, `eSIM`, `new SIM`, `SIM swap`, `activate SIM`, `SIM stolen`
- **Screen**: New `SimManagementScreen` with verification step, operation status, and instructions

### Mock Data

```json
{
  "currentSim": {
    "type": "physical",
    "iccid": "8901...1234",
    "status": "active"
  },
  "esimCapable": true,
  "pendingSwap": null,
  "verificationRequired": true
}
```

### New Artifacts

| File                                                                     | Purpose                                             |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| `backend/src/application/sub-agents/sim-management-sub-agent.service.ts` | SIM operations with verification gate               |
| `backend/src/infrastructure/telco/sim.service.ts`                        | Mock SIM inventory, swap status, eSIM provisioning  |
| `src/screens/SimManagementScreen/`                                       | Verification form, operation progress, instructions |

### Complexity

Medium — ~8 hours. The verification gate pattern is reusable for other sensitive operations.

### Priority: **Medium**

Demonstrates security-gated agent actions — important for enterprise credibility.

---

## 6. Roaming & Travel Packages

### Motivation

Travel-related telecom queries have high natural language complexity: date parsing, destination recognition, package comparison. This showcases Tier 3 LLM entity extraction at its best.

### User Stories

- "I'm traveling to Japan next week" → Agent shows roaming packages for Japan, current roaming status, and recommended add-ons
- "How much does data cost in Europe?" → Agent lists EU roaming rates and suggests travel packages
- "Turn on roaming" → Agent enables international roaming with cost warning
- "I'm back home, turn off roaming" → Agent disables roaming and summarizes roaming charges incurred

### Architecture Fit

- **LLM entity extraction**: Destination country and travel dates extracted by LLM from natural language
- **New sub-agent**: `RoamingSubAgent` — queries destination rates, available travel packages, and current roaming status
- **Intent routing**: `TelecomIntent.ROAMING` — Tier 3 only (requires destination extraction). Tier 1 keywords for status-only: `roaming status`, `roaming on`, `roaming off`
- **Screen**: New `RoamingScreen` with destination selector, package cards, roaming toggle, and cost estimator

### New Artifacts

| File                                                              | Purpose                                       |
| ----------------------------------------------------------------- | --------------------------------------------- |
| `backend/src/application/sub-agents/roaming-sub-agent.service.ts` | Destination rates + package matching          |
| `backend/src/infrastructure/telco/roaming.service.ts`             | Mock roaming rates, zones, travel packages    |
| `backend/src/data/roaming-zones.json`                             | Country → zone mapping, rates per zone        |
| `src/screens/RoamingScreen/`                                      | Destination, packages, cost estimator, toggle |

### Complexity

Medium — ~8 hours. Country recognition and date parsing are handled by the LLM; backend is mostly data lookup.

### Priority: **Medium**

Common high-value use case with good natural language complexity for demoing LLM capabilities.

---

## 7. Usage Prediction & Budget Alerts

### Motivation

Predictive analytics differentiate an AI agent from a static dashboard. Projecting end-of-cycle usage based on current consumption patterns and warning users about potential overage charges demonstrates analytical capability.

### User Stories

- "Will I run out of data this month?" → Agent projects usage and answers yes/no with confidence
- "How much data will I use by end of month?" → Agent shows projected vs. allowance chart
- "Set a budget alert at $50" → Agent configures a spending alert
- "Am I going to get charged extra?" → Agent checks if projected usage exceeds bundle limits

### Architecture Fit

- **Prediction logic**: Simple linear projection in a domain service (no ML needed for POC). `currentUsage / daysElapsed * totalDays` compared against allowance.
- **New sub-agent**: `UsagePredictionSubAgent` — queries usage history, calculates projection, generates forecast screen
- **Intent routing**: `TelecomIntent.PREDICT_USAGE` — Tier 1 keywords: `predict`, `forecast`, `will I run out`, `budget`, `overage`. Can also be Tier 3 for specific questions.
- **Screen**: Enhanced `UsageScreen` or new `ForecastScreen` with projected line on usage bar, confidence range, and recommended actions

### Projection Formula (POC)

```typescript
const daysElapsed = daysSinceCycleStart(subscription.cycleStartDate);
const daysRemaining = subscription.cycleDays - daysElapsed;
const dailyRate = currentUsage / Math.max(daysElapsed, 1);
const projectedTotal = currentUsage + dailyRate * daysRemaining;
const overageRisk = projectedTotal > allowance;
```

### New Artifacts

| File                                                                       | Purpose                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------- |
| `backend/src/domain/services/usage-prediction.service.ts`                  | Linear projection + risk classification              |
| `backend/src/application/sub-agents/usage-prediction-sub-agent.service.ts` | Orchestrates prediction + screen data                |
| `src/screens/ForecastScreen/`                                              | Projected usage bar, risk indicator, recommendations |

### Complexity

Low-Medium — ~6 hours. Simple math, but the visualization needs to be clear and compelling.

### Priority: **Medium**

Good demonstration of analytical/predictive agent capability with minimal implementation cost.

---

## 8. Multilingual Support

### Motivation

Telecom companies serve linguistically diverse populations. Language detection + translated responses demonstrate real-world enterprise readiness. The three-tier routing architecture is particularly interesting here: Tier 1 needs keyword maps per language, Tier 2 fuzzy matching works across similar languages, and Tier 3 LLM handles multilingual naturally.

### User Stories

- "Cuál es mi saldo?" (Spanish) → Balance screen with Spanish labels
- "查看我的流量" (Chinese) → Usage screen with Chinese labels
- User switches language mid-conversation → Agent adapts seamlessly

### Architecture Fit

- **Tier 1 keywords**: Add per-language keyword sets in `intent-keywords.json`:
  ```json
  {
    "CHECK_BALANCE": {
      "en": ["balance", "credit", "how much"],
      "es": ["saldo", "crédito", "cuánto"],
      "zh": ["余额", "话费", "流量"]
    }
  }
  ```
- **Language detection**: LLM-based (Tier 3 passthrough) or simple heuristic (character set detection for CJK, dictionary lookup for European languages)
- **Screen localization**: Add `i18n/` folder with per-locale string maps. Screens read labels from locale context.
- **System prompt**: Instruct LLM to respond in the detected language

### New Artifacts

| File                                                       | Purpose                                   |
| ---------------------------------------------------------- | ----------------------------------------- |
| `backend/data/intent-keywords.json`                        | Extended with per-language keyword sets   |
| `backend/src/domain/services/language-detector.service.ts` | Heuristic + LLM fallback detection        |
| `src/i18n/`                                                | Locale string maps (en, es, zh minimum)   |
| `src/i18n/useLocale.ts`                                    | React hook for locale-aware string lookup |

### Complexity

High — ~15 hours. Keyword maps, screen labels, LLM prompt adaptation, and testing across languages.

### Priority: **Low-Medium**

High enterprise value but significant effort. Best tackled after core features are stable. Start with 2 languages (en + es) as proof of concept.

---

## Feature Priority Matrix

| #   | Feature                 | Demo Impact | Implementation Cost | LLM Showcase | Architectural Novelty  | Priority        |
| --- | ----------------------- | ----------- | ------------------- | ------------ | ---------------------- | --------------- |
| 1   | Proactive Notifications | ★★★★★       | Medium (8h)         | Low          | Push model             | **High**        |
| 2   | Bill Explanation        | ★★★★★       | Medium (6h)         | High         | LLM summarization      | **High**        |
| 3   | Plan Recommendation     | ★★★★☆       | Medium-High (10h)   | High         | Multi-source reasoning | **Medium-High** |
| 4   | Troubleshooting Flows   | ★★★★☆       | High (12h)          | Medium       | Multi-turn state       | **Medium**      |
| 5   | SIM Management          | ★★★☆☆       | Medium (8h)         | Low          | Verification gates     | **Medium**      |
| 6   | Roaming & Travel        | ★★★★☆       | Medium (8h)         | High         | Entity extraction      | **Medium**      |
| 7   | Usage Prediction        | ★★★☆☆       | Low-Medium (6h)     | Low          | Analytical reasoning   | **Medium**      |
| 8   | Multilingual Support    | ★★★★☆       | High (15h)          | Medium       | Cross-language routing | **Low-Medium**  |

### Recommended Implementation Order

1. **Bill Explanation** — Fastest to implement, highest LLM value-add, universally understood use case
2. **Proactive Notifications** — Differentiates from static dashboard, reuses existing tools
3. **Usage Prediction** — Low effort, demonstrates analytical capability, extends existing UsageScreen
4. **Plan Recommendation** — Strong demo, builds on bundles + usage infrastructure
5. **Roaming & Travel** — Good NLU showcase, standalone feature
6. **Troubleshooting Flows** — Highest architectural impact, save for when multi-turn is prioritized
7. **SIM Management** — Valuable for enterprise demo, requires verification pattern
8. **Multilingual** — Tackle last, benefits from all other features being stable

### Total Estimated Effort

~73 hours for all 8 features. Features 1–3 (~20 hours) deliver the highest value-to-effort ratio and are recommended as the first expansion wave.
