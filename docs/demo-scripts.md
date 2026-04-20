# Telecom Agent PWA Demo Scripts

Two screen-recording scripts demonstrating the difference between keyword-routed requests (non-LLM) and LLM-powered requests.

---

## Version A — Non-LLM (Keyword Routing)

**Purpose:** Show fast, keyword-matched responses that resolve without LLM involvement.

| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open `http://localhost:5173` | App loads with "How can I help you today?" |
| 2 | Click **💰 Balance** | Balance screen: `$13.79`, auto-renews Apr 29 — instant |
| 3 | Click **📦 Bundles** | Bundle list: Value Plus + Weekend Pass, Starter Pack, Travel Roaming, Unlimited Pro — instant |
| 4 | Type `check my usage` and send | Usage screen: Data (6.2/4006 GB), Voice (215/500 min), SMS (55/200) — instant |
| 5 | Type `I need support` and send | Support screen with Tickets and FAQ sections — instant |

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
| 2 | Type `Can I add more data to my current plan?` and send | "Step 2 of 3: Processing" appears → Account Overview screen with active subscriptions |
| 3 | Type `I'm watching Netflix and streaming music while commuting. What bundle should I get?` and send | "Step 2 of 3: Processing" appears → Bundle list with Value Plus recommended |
| 4 | Switch user to **Sam Patel - Unlimited Pro** | Context resets to Sam's account |
| 5 | Type `Can I add more data to my current plan?` and send | LLM processes → Sam's Account Overview with Unlimited Pro data |

**Visual cues:**
- "Step 2 of 3: Processing (in progress)" indicator with step checklist
- Text input disabled during processing
- Response time: 5-15 seconds
- Network tab: SSE streaming to `/api/agent/chat/stream`

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

---

## Key Visual Comparison

| | Version A (Non-LLM) | Version B (LLM) |
|--|--|--|
| Response time | < 1 second | 5-15 seconds |
| Processing indicator | Never | "Step 2 of 3: Processing" |
| Network (`/chat/stream`) | No calls | SSE streaming |
| Response type | Structured screens only | Free-text + suggestions + screens |
