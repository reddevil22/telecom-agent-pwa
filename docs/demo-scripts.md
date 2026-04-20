# Telecom Agent PWA Demo Scripts

Three screen-recording scripts: non-LLM keyword routing, LLM-powered streaming, and the in-context top-up purchase flow.

---

## Version A — Non-LLM (Keyword Routing)

**Purpose:** Show fast, keyword-matched responses that resolve without LLM involvement.

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `http://localhost:5173` | App loads with "How can I help you today?" |
| 2 | Select **Jamie Chen - Value Plus** from the user dropdown | Context switches to Jamie |
| 3 | Click **💰 Balance** | Balance screen: shows current balance — instant |
| 4 | Click **📦 Bundles** | Bundle list: Value Plus + Weekend Pass, Starter Pack, Travel Roaming, Unlimited Pro — instant |
| 5 | Type `check my usage` and send | Usage screen with data/voice/SMS — instant |
| 6 | Type `I need support` and send | Support screen with Tickets and FAQ sections — instant |

**Visual cues:**
- No loading spinner or processing indicator
- Responses appear in <1 second
- Network tab: no `/chat/stream` calls for these requests

---

## Version B — LLM (Streaming + Tier 3 Routing)

**Purpose:** Show slower, nuance-aware responses powered by the LLM with streaming feedback.

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `http://localhost:5173` | App loads |
| 2 | Select **Jamie Chen - Value Plus** from the user dropdown | Context switches to Jamie |
| 3 | Type `Can I add more data to my current plan?` and send | "Step 2 of 3: Processing" appears → Account Overview screen with active subscriptions |
| 4 | Type `I'm watching Netflix and streaming music while commuting. What bundle should I get?` and send | "Step 2 of 3: Processing" appears → Bundle list with Value Plus recommended |
| 5 | Switch user to **Sam Patel - Unlimited Pro** | Context resets to Sam's account |
| 6 | Type `Can I add more data to my current plan?` and send | LLM processes → Sam's Account Overview with Unlimited Pro data |

**Visual cues:**
- "Step 2 of 3: Processing (in progress)" indicator with step checklist
- Text input disabled during processing
- Response time: 5-15 seconds
- Network tab: SSE streaming to `/api/agent/chat/stream`

---

## Version C — In-Context Top-Up (Customer Feature)

**Purpose:** Demonstrate the inline top-up panel — the customer adds funds without leaving the bundle purchase flow.

**Prerequisite:** Use Jamie Chen (balance $13.79). If balance has changed, reset via `node reset-test-balance.cjs`.

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `http://localhost:5173` | App loads |
| 2 | Select **Jamie Chen - Value Plus** from the user dropdown | Context switches to Jamie ($13.79 balance) |
| 3 | Click **📦 Bundles** quick action | Bundle list appears — instant |
| 4 | Click **View Details** on **Value Plus** ($19.99) | Bundle detail screen shows: current balance $13.79, balance after purchase: **-$6.20**, insufficient balance warning |
| 5 | Observe the **Top Up Panel** appears below the warning | Panel shows "You have $13.79 — needs $19.99" with +$5, +$10, +$20, +$50 buttons |
| 6 | Observe **Confirm Purchase** button is disabled | Button shows "Insufficient Balance" and is greyed out |
| 7 | Click **+$10** on the top-up panel | "Adding funds..." spinner appears in the panel |
| 8 | Confirm dialog appears | "Confirm Top-up" dialog with "Please confirm this top-up before we process it." |
| 9 | Click **Confirm request** | Dialog closes, "Top-up Successful!" screen shows with "New Balance: USD 23.79" |
| 10 | **Confirm Purchase** button is now enabled | Button turns active, shows "Confirm Purchase" |
| 11 | Click **Confirm Purchase** | Purchase confirmation appears — bundle confirmed |

**Visual cues:**
- Top-up panel is visually distinct: error-bg color with border
- Confirmation dialog is a separate screen overlay
- Success screen confirms new balance before enabling purchase
- User never navigated away from the bundle detail screen

---

## Prompt Reference

### Triggers Tier 1 (non-LLM) — avoid for Version B:
- `show my balance` / `balance`
- `check my usage`
- `what bundles are available?`
- `I need support`
- `show my account`
- `account status`

### Triggers LLM (Tier 3) — use for Version B:
- `Can I add more data to my current plan?`
- `I'm traveling to Europe next month and need data while roaming`
- `I'm watching Netflix and streaming music while commuting. What bundle should I get?`

### In-Context Top-Up (Version C) — UI-driven:
- No text prompt needed — triggered by navigating to a bundle detail screen when balance is insufficient
- The top-up amount buttons send `top up $N` through the same chat endpoint as typed prompts

---

## Key Visual Comparison

| | Version A (Non-LLM) | Version B (LLM) | Version C (Top-Up) |
|--|--|--|--|
| Response time | < 1 second | 5-15 seconds | 3-8 seconds |
| Processing indicator | Never | "Step 2 of 3: Processing" | "Adding funds..." spinner |
| Network (`/chat/stream`) | No calls | SSE streaming | SSE streaming |
| Trigger | Quick action button or typed keyword | Free-text nuance | UI navigation (balance check) |
| Purchase context | N/A | N/A | Inline — no navigation away |
