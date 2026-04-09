# QA Testing Plan: LLM Resilience Layer

## Environment Setup

**Prerequisites:**
- Backend running on `http://localhost:3001`
- Frontend dev server on `http://localhost:5173`
- Playwright config `baseURL` must match the dev server port (currently set to 5177 — update to 5173)

**Selector reference:**

| Selector | Component |
|----------|-----------|
| `[data-testid="quick-actions"]` | QuickActionBar container |
| `[data-testid="quick-action-balance"]` | Balance quick-action button |
| `[data-testid="quick-action-bundles"]` | Bundles quick-action button |
| `[data-testid="quick-action-usage"]` | Usage quick-action button |
| `[data-testid="quick-action-support"]` | Support quick-action button |
| `[data-testid="quick-action-account"]` | Account quick-action button |
| `[data-testid="degraded-banner"]` | Degraded mode banner |
| `[data-testid="chat-tab"]` | Chat tab button |
| `[data-testid="history-tab"]` | History tab button |
| `[data-testid="chat-history"]` | Chat message list |
| `[data-testid="chat-bubble"]` | Individual chat message |
| `input[type="text"]` | Prompt text input |
| `button[type="submit"]` | Send button |

**Note:** Screen components (BalanceScreen, BundlesScreen, etc.) do NOT have `data-testid` attributes. Use text content assertions (e.g., `getByText('Current Balance')`) as the existing tests do.

---

## Test Suite 1: Quick-Action Buttons

### 1.1 Quick actions render on app load
- Navigate to `/`
- Assert `[data-testid="quick-actions"]` is visible
- Assert all 5 buttons are present: balance, bundles, usage, support, account

### 1.2 Balance quick action
- Click `[data-testid="quick-action-balance"]`
- Assert "Current Balance" text appears within 15s
- Assert chat bubble with user message "Show my balance" is in chat history
- Assert chat bubble with agent reply is in chat history

### 1.3 Bundles quick action
- Click `[data-testid="quick-action-bundles"]`
- Assert "Starter Pack" text appears within 15s
- Assert "Value Plus" is visible

### 1.4 Usage quick action
- Click `[data-testid="quick-action-usage"]`
- Assert text containing "data" and "GB" appears within 15s

### 1.5 Support quick action
- Click `[data-testid="quick-action-support"]`
- Assert "Your Tickets" or "Frequently Asked" text appears within 15s

### 1.6 Account quick action
- Click `[data-testid="quick-action-account"]`
- Assert "Alex Morgan" appears within 15s
- Assert "Active Subscriptions" is visible

### 1.7 Quick actions remain after chat interaction
- Type "show my balance" in prompt, submit
- Wait for response
- Assert `[data-testid="quick-actions"]` is still visible
- Click `[data-testid="quick-action-usage"]`
- Assert usage screen renders

---

## Test Suite 2: Intent Router (Hybrid Routing)

### 2.1 Tier 1 keywords bypass LLM
- Send "show my balance" via prompt input
- Assert balance screen renders
- **Performance check:** Response should appear faster than ~2s (since no LLM call)
- Note: The backend logs `"Intent router resolved — skipping LLM"` with `tier: 'keyword'`

### 2.2 Tier 1 for all 5 intents
- Test each prompt: "show my balance", "what bundles are available", "check my usage", "I need support", "show my account"
- For each: assert correct screen renders

### 2.3 Tier 2 fuzzy cache after first LLM resolution
- Send a novel prompt like "remaining funds on my number" (not a Tier 1 keyword match)
- First call: LLM classifies → balance screen appears
- Send same prompt again
- Second call: should be faster (fuzzy cache hit)

### 2.4 Tier 3 still works for entity extraction
- Send "buy the Value Plus bundle"
- Assert bundle detail screen or LLM-routed response appears
- This requires LLM routing since it needs bundleId extraction

---

## Test Suite 3: Circuit Breaker & Degraded Mode

### 3.1 Normal mode — no degraded banner
- Navigate to `/`
- Assert `[data-testid="degraded-banner"]` is NOT visible
- Assert `input[type="text"]` is enabled

### 3.2 GET /api/agent/status returns correct shape
- Fetch `http://localhost:3001/api/agent/status`
- Assert response has `{ llm: "available", mode: "normal", circuitState: "closed" }`

### 3.3 Degraded mode — LLM down scenario
- **Setup:** Block LLM endpoint (or mock 3 consecutive failures)
- Send 3 requests that require LLM (e.g., "buy starter pack")
- After 3 failures, poll `/api/agent/status`
- Assert `{ mode: "degraded" }`
- Navigate to `/` or wait for status poll
- Assert `[data-testid="degraded-banner"]` IS visible
- Assert `input[type="text"]` is NOT present (hidden in degraded mode)
- Assert `[data-testid="quick-actions"]` IS still visible

### 3.4 Quick actions work in degraded mode
- With circuit breaker open (degraded mode)
- Click `[data-testid="quick-action-balance"]`
- Assert balance screen still renders (Tier 1 keyword match works without LLM)

### 3.5 Circuit breaker auto-recovers
- After degraded mode is active, wait 30+ seconds
- Poll `/api/agent/status`
- Assert circuit state transitions to `half_open`
- Send a request → if LLM is back, assert `{ mode: "normal" }`
- Assert degraded banner disappears

---

## Test Suite 4: SSE Streaming

### 4.1 Processing steps update during LLM call
- Navigate to `/`
- Send a prompt that requires LLM (e.g., "buy the Starter Pack")
- Watch the processing indicator area
- Assert step labels appear with transitions:
  - "Understanding your request" → done
  - "Processing" → active → done
  - "Preparing response" → done

### 4.2 Non-streaming fallback
- If SSE endpoint fails, the app should fall back to standard POST
- Assert response still renders correctly
- Test by temporarily blocking `/api/agent/chat/stream` while keeping `/api/agent/chat` available

---

## Test Suite 5: Regression — Existing Flows

### 5.1 All original chat flows still work
Re-run the existing `agent.spec.ts` test patterns:
- "show my balance" → balance screen
- "what bundles are available?" → bundles screen
- "check my usage" → usage screen
- "I need help" → support screen
- "show my account" → account screen

### 5.2 History flows still work
Re-run `history.spec.ts` patterns:
- Save and restore conversation after refresh
- List sessions in history tab
- Delete and cancel delete

---

## Test Suite 6: Quick-Actions API Endpoint

### 6.1 GET /api/agent/quick-actions
- Fetch `http://localhost:3001/api/agent/quick-actions`
- Assert response has `{ actions: [...] }` with 5 items
- Each item has `id`, `label`, `icon`, `syntheticPrompt`
- Assert `Cache-Control: public, max-age=300` header

### 6.2 Quick-actions endpoint works without LLM
- Stop or block the LLM server
- Fetch `/api/agent/quick-actions`
- Assert it still returns 200 with the correct payload

---

## Execution Notes for QA Agent

1. **Playwright MCP setup:** Use `browser-testing-with-devtools` skill for real browser control. The MCP provides `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot` etc.

2. **Backend mocking for circuit breaker tests:** The hardest tests are Suite 3 (circuit breaker). Options:
   - Start backend with an invalid `LLM_BASE_URL` to force failures
   - Use Playwright's route interception to mock the backend responses
   - Create a separate test backend config

3. **Timing:** Streaming tests (Suite 4) need careful timing. Use `waitForSelector` with timeouts rather than `waitForTimeout`.

4. **Test order:** Run Suite 5 (regression) first to establish baseline, then new feature suites.
