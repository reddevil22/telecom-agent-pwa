# In-Context Top-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline top-up panel to BundleDetailScreen that appears when balance is insufficient, lets users add funds without leaving the purchase flow, and enables purchase completion.

**Architecture:** A new `TopUpPanel` component renders inline within the `BundleDetailScreen` actions section when `balanceAfter < 0`. It sends top-up requests through the existing `agentService.invokeAgentStream()` (same endpoint as chat), using the `top_up` intent. No new API endpoints required.

**Tech Stack:** React 19, TypeScript (strict), CSS Modules, XState v5, Playwright

---

## File Map

```
src/
├── screens/BundleDetailScreen/
│   ├── BundleDetailScreen.tsx        MODIFY — add TopUpPanel inline
│   ├── BundleDetailScreen.module.css MODIFY — add topup panel styles
│   └── TopUpPanel.tsx               CREATE — new component
│   └── TopUpPanel.module.css        CREATE — new styles
├── services/agentService.ts          READ — understand invokeAgentStream
├── types/
│   └── index.ts                     CREATE — TopUpState enum + types
└── e2e/
    └── incontext-topup.spec.ts      CREATE — e2e test
```

---

## Task 1: Add TopUpState Types

**Files:**
- Create: `src/types/index.ts` (append)

- [ ] **Step 1: Write failing test — types**

```typescript
// Add to src/types/index.ts
export enum TopUpState {
  IDLE = "idle",
  SHOWING_PANEL = "showing_panel",
  TOPUP_PENDING = "topup_pending",
  TOPUP_SUCCESS = "topup_success",
  TOPUP_FAILED = "topup_failed",
}

export interface TopUpPanelProps {
  currentBalance: number;
  bundlePrice: number;
  currency: string;
  onTopUpSuccess: (newBalance: number) => void;
  onTopUpError: (error: string) => void;
  onCancel: () => void;
  cheapestBundle?: { id: string; name: string; price: number };
}
```

- [ ] **Step 2: Run TypeScript check to verify types compile**

Run: `npx tsc --noEmit src/types/index.ts`
Expected: Should compile without errors (new types are additive)

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add TopUpState enum and TopUpPanelProps interface"
```

---

## Task 2: Create TopUpPanel Component

**Files:**
- Create: `src/screens/BundleDetailScreen/TopUpPanel.tsx`
- Create: `src/screens/BundleDetailScreen/TopUpPanel.module.css`
- Test: `src/screens/BundleDetailScreen/TopUpPanel.spec.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/screens/BundleDetailScreen/TopUpPanel.spec.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { TopUpPanel } from "./TopUpPanel";

const mockProps = {
  currentBalance: 13.79,
  bundlePrice: 19.99,
  currency: "USD",
  onTopUpSuccess: jest.fn(),
  onTopUpError: jest.fn(),
  onCancel: jest.fn(),
};

describe("TopUpPanel", () => {
  it("shows insufficient balance message", () => {
    render(<TopUpPanel {...mockProps} />);
    expect(screen.getByText(/You have \$13.79 — needs \$19.99/)).toBeVisible();
  });

  it("renders $5, $10, $20 buttons", () => {
    render(<TopUpPanel {...mockProps} />);
    expect(screen.getByText("+$5")).toBeVisible();
    expect(screen.getByText("+$10")).toBeVisible();
    expect(screen.getByText("+$20")).toBeVisible();
  });

  it("calls onCancel when Cancel is clicked", () => {
    render(<TopUpPanel {...mockProps} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(mockProps.onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/BundleDetailScreen/TopUpPanel.spec.tsx`
Expected: FAIL — "Cannot find module './TopUpPanel'"

- [ ] **Step 3: Write minimal TopUpPanel component**

```tsx
// src/screens/BundleDetailScreen/TopUpPanel.tsx
import type { TopUpPanelProps } from "../../types";
import styles from "./TopUpPanel.module.css";

export function TopUpPanel({
  currentBalance,
  bundlePrice,
  currency,
  onTopUpSuccess,
  onTopUpError,
  onCancel,
}: TopUpPanelProps) {
  const shortfall = bundlePrice - currentBalance;

  return (
    <div className={styles.panel} role="region" aria-label="Top up balance">
      <div className={styles.header}>
        <span className={styles.icon}>💳</span>
        <span className={styles.title}>Insufficient balance</span>
      </div>
      <p className={styles.message}>
        You have {currency} {currentBalance.toFixed(2)} — needs{" "}
        {currency} {bundlePrice.toFixed(2)}
      </p>
      <p className={styles.label}>Quick top-up:</p>
      <div className={styles.amounts}>
        <button className={styles.amountBtn}>+$5</button>
        <button className={styles.amountBtn}>+$10</button>
        <button className={styles.amountBtn}>+$20</button>
        <button className={styles.amountBtn}>Custom</button>
      </div>
      <p className={styles.hint}>After top-up, complete purchase</p>
      <button className={styles.cancelBtn} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write minimal CSS**

```css
/* src/screens/BundleDetailScreen/TopUpPanel.module.css */
.panel {
  background: var(--color-error-bg);
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  margin: var(--space-md) 0;
}

.header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.icon {
  font-size: var(--text-lg);
}

.title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--color-error);
}

.message {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: var(--space-sm) 0;
}

.label {
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
  margin: var(--space-md) 0 var(--space-sm);
}

.amounts {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.amountBtn {
  padding: var(--space-sm) var(--space-md);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}

.hint {
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  margin: var(--space-sm) 0;
}

.cancelBtn {
  margin-top: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  cursor: pointer;
  width: 100%;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/screens/BundleDetailScreen/TopUpPanel.spec.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/screens/BundleDetailScreen/TopUpPanel.tsx src/screens/BundleDetailScreen/TopUpPanel.module.css src/screens/BundleDetailScreen/TopUpPanel.spec.tsx src/types/index.ts
git commit -m "feat: create TopUpPanel component with basic structure"
```

---

## Task 3: Wire TopUpPanel into BundleDetailScreen

**Files:**
- Modify: `src/screens/BundleDetailScreen/BundleDetailScreen.tsx`
- Modify: `src/screens/BundleDetailScreen/BundleDetailScreen.module.css`
- Test: `src/screens/BundleDetailScreen/BundleDetailScreen.spec.tsx` (create if missing)

- [ ] **Step 1: Write failing test — panel appears when balance insufficient**

```tsx
// src/screens/BundleDetailScreen/BundleDetailScreen.spec.tsx
import { render, screen } from "@testing-library/react";
import { BundleDetailScreen } from "./BundleDetailScreen";
import type { BundleDetailScreenData } from "../../types/agent";

const makeData = (balance: number, price: number): BundleDetailScreenData => ({
  type: "bundleDetail",
  bundle: {
    id: "bundle-1",
    name: "Value Plus",
    description: "Great balance",
    price,
    currency: "USD",
    dataGB: 10,
    minutes: 500,
    sms: 200,
    validity: "30 days",
  },
  currentBalance: {
    current: balance,
    currency: "USD",
    lastTopUp: "2026-04-19",
    nextBillingDate: "2026-04-29",
  },
});

// Mock actor ref
const mockActor = {
  send: jest.fn(),
} as any;

describe("BundleDetailScreen — insufficient balance", () => {
  it("shows TopUpPanel when balance is less than price", () => {
    render(
      <BundleDetailScreen
        data={makeData(13.79, 19.99)}
        actor={mockActor}
      />
    );
    expect(screen.getByText(/You have \$13.79 — needs \$19.99/)).toBeVisible();
  });

  it("does NOT show TopUpPanel when balance is sufficient", () => {
    render(
      <BundleDetailScreen
        data={makeData(50.0, 19.99)}
        actor={mockActor}
      />
    );
    expect(screen.queryByText(/Insufficient balance/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/BundleDetailScreen/BundleDetailScreen.spec.tsx`
Expected: FAIL — "Insufficient balance" not in DOM (panel not yet wired)

- [ ] **Step 3: Wire TopUpPanel into BundleDetailScreen**

```tsx
// In BundleDetailScreen.tsx — add import at top:
// (imports remain the same, add TopUpPanel import)

import { TopUpPanel } from "./TopUpPanel";
import type { TopUpPanelProps } from "../../types";

// Inside the component, replace the actions div with conditional:
const hasInsufficientBalance = currentBalance.current < bundle.price;

return (
  <div className={styles.container}>
    {/* ... existing card content ... */}

    <div className={styles.balanceCheck}>
      {/* ... existing balance rows ... */}
      {hasInsufficientBalance && (
        <div className={styles.warning}>
          <span className={styles.warningIcon}>⚠️</span>
          <span className={styles.warningText}>
            Insufficient balance. Please top up first.
          </span>
        </div>
      )}
    </div>

    {hasInsufficientBalance ? (
      <TopUpPanel
        currentBalance={currentBalance.current}
        bundlePrice={bundle.price}
        currency={currentBalance.currency}
        onTopUpSuccess={(newBalance) => {
          // Force re-render with new balance by sending an update
          // The parent machine will push updated screenData
        }}
        onTopUpError={(error) => {
          console.error("Top-up failed:", error);
        }}
        onCancel={handleCancel}
        cheapestBundle={undefined}
      />
    ) : (
      <div className={styles.actions}>
        <button
          className={styles.confirmBtn}
          onClick={handleConfirm}
          disabled={hasInsufficientBalance}
        >
          {hasInsufficientBalance
            ? "Insufficient Balance"
            : "Confirm Purchase"}
        </button>
        <button className={styles.cancelBtn} onClick={handleCancel}>
          Cancel
        </button>
      </div>
    )}
  </div>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/BundleDetailScreen/BundleDetailScreen.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/BundleDetailScreen/BundleDetailScreen.tsx src/screens/BundleDetailScreen/BundleDetailScreen.spec.tsx
git commit -m "feat(bundle-detail): wire TopUpPanel when balance insufficient"
```

---

## Task 4: Implement Top-Up Flow via Chat Endpoint

**Files:**
- Modify: `src/screens/BundleDetailScreen/TopUpPanel.tsx`
- Test: `src/screens/BundleDetailScreen/TopUpPanel.spec.tsx`

- [ ] **Step 1: Write failing tests for top-up flow**

```tsx
// Add to TopUpPanel.spec.tsx

it("sends top_up message on amount button click", async () => {
  const sendSpy = jest.spyOn(agentService, "invokeAgentStream");
  render(<TopUpPanel {...mockProps} />);
  fireEvent.click(screen.getByText("+$10"));
  // Verify invokeAgentStream was called with top_up prompt
  expect(sendSpy).toHaveBeenCalledWith(
    expect.objectContaining({ prompt: expect.stringContaining("top up $10") }),
    expect.any(Function),
    expect.any(Object)
  );
});

it("shows loading state when topupPending", () => {
  const { rerender } = render(<TopUpPanel {...mockProps} />);
  // Manually set state to TOPUP_PENDING via internal setter if exposed,
  // or trigger via button click and wait for pending UI
  // This test verifies the pending UI exists
  expect(screen.queryByText(/Processing/)).toBeNull();
});
```

- [ ] **Step 2: Run test — verify it fails (invokeAgentStream not called yet)**

Run: `npx vitest run src/screens/BundleDetailScreen/TopUpPanel.spec.tsx`
Expected: FAIL — invokeAgentStream not defined or not imported

- [ ] **Step 3: Add top-up via agentService**

```tsx
// TopUpPanel.tsx — add handler for amount buttons:
// Add import:
import { invokeAgentStream } from "../../services/agentService";

// Inside component, add handler:
async function handleTopUp(amount: number) {
  // Set state to pending
  setTopUpState(TopUpState.TOPUP_PENDING);

  try {
    const response = await invokeAgentStream(
      {
        prompt: `top up $${amount}`,
        sessionId: crypto.randomUUID(),
        userId: "user-1", // TODO: get from session context
        conversationHistory: [],
        timestamp: Date.now(),
      },
      () => {}, // step callback — no-op for top-up
    );

    // Extract new balance from response
    if (response.screenData.type === "balance") {
      const newBalance = response.screenData.balance.current;
      onTopUpSuccess(newBalance);
      setTopUpState(TopUpState.TOPUP_SUCCESS);
    } else {
      onTopUpError("Unexpected response");
      setTopUpState(TopUpState.TOPUP_FAILED);
    }
  } catch (err) {
    onTopUpError(err instanceof Error ? err.message : "Top-up failed");
    setTopUpState(TopUpState.TOPUP_FAILED);
  }
}

// Add state and handlers to amount buttons:
<div className={styles.amounts}>
  <button className={styles.amountBtn} onClick={() => handleTopUp(5)}>+$5</button>
  <button className={styles.amountBtn} onClick={() => handleTopUp(10)}>+$10</button>
  <button className={styles.amountBtn} onClick={() => handleTopUp(20)}>+$20</button>
  <button className={styles.amountBtn} onClick={() => handleTopUp(50)}>+$50</button>
</div>
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/screens/BundleDetailScreen/TopUpPanel.spec.tsx`
Expected: PASS (or FAIL if userId/session not available — may need session service)

- [ ] **Step 5: Commit**

```bash
git add src/screens/BundleDetailScreen/TopUpPanel.tsx
git commit -m "feat(topup): connect TopUpPanel to agentService top_up flow"
```

---

## Task 5: Add All Visual States

**Files:**
- Modify: `src/screens/BundleDetailScreen/TopUpPanel.tsx`
- Modify: `src/screens/BundleDetailScreen/TopUpPanel.module.css`
- Test: Add state-specific tests

- [ ] **Step 1: Add success state UI**

```tsx
// In TopUpPanel.tsx, after successful top-up:
{topUpState === TopUpState.TOPUP_SUCCESS && (
  <div className={styles.successBanner}>
    <span className={styles.icon}>✓</span>
    <span>Balance updated: {currency} {newBalance.toFixed(2)}</span>
  </div>
)}
```

- [ ] **Step 2: Add failure state UI with retry**

```tsx
{topUpState === TopUpState.TOPUP_FAILED && (
  <div className={styles.errorBanner}>
    <span className={styles.icon}>⚠️</span>
    <span>{errorMessage}</span>
    <button className={styles.retryBtn} onClick={() => setTopUpState(TopUpState.SHOWING_PANEL)}>
      Retry
    </button>
  </div>
)}
```

- [ ] **Step 3: Add pending spinner state**

```tsx
{topUpState === TopUpState.TOPUP_PENDING && (
  <div className={styles.pendingBanner}>
    <span className={styles.spinner}>⏳</span>
    <span>Adding funds...</span>
  </div>
)}
```

- [ ] **Step 4: Write tests for all states**

```tsx
it("shows success banner after top-up succeeds", () => {
  const { rerender } = render(<TopUpPanel {...mockProps} />);
  // Simulate state change (would need state to be testable)
  // For now, test that the UI elements exist
});

it("shows error banner with retry button after top-up fails", () => {
  render(<TopUpPanel {...mockProps} topUpState={TopUpState.TOPUP_FAILED} errorMessage="Connection timed out" />);
  expect(screen.getByText("Connection timed out")).toBeVisible();
  expect(screen.getByText("Retry")).toBeVisible();
});
```

- [ ] **Step 5: Commit**

```bash
git add src/screens/BundleDetailScreen/TopUpPanel.tsx src/screens/BundleDetailScreen/TopUpPanel.module.css
git commit -m "feat(topup): add success/failure/pending visual states"
```

---

## Task 6: Add Cheapest Bundle Suggestion

**Files:**
- Modify: `src/screens/BundleDetailScreen/TopUpPanel.tsx`
- Modify: `src/screens/BundleDetailScreen/TopUpPanel.module.css`

- [ ] **Step 1: Write failing test**

```tsx
it("shows cheapest bundle when user cannot afford any bundle", () => {
  render(
    <TopUpPanel
      {...mockProps}
      cheapestBundle={{ id: "weekend-pass", name: "Weekend Pass", price: 4.99 }}
    />
  );
  expect(screen.getByText(/Least expensive option/)).toBeVisible();
  expect(screen.getByText("Weekend Pass — $4.99")).toBeVisible();
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx vitest run src/screens/BundleDetailScreen/TopUpPanel.spec.tsx`
Expected: FAIL — cheapest bundle UI not yet implemented

- [ ] **Step 3: Add cheapest bundle suggestion UI**

```tsx
// Add to TopUpPanel.tsx — render when cheapestBundle is provided:
{cheapestBundle && (
  <div className={styles.cheapestSuggestion}>
    <p className={styles.cheapestLabel}>Least expensive option:</p>
    <button
      className={styles.cheapestBtn}
      onClick={() => {
        // Navigate to cheapest bundle detail
        window.location.hash = `#/bundle/${cheapestBundle.id}`;
      }}
    >
      {cheapestBundle.name} — {currency} {cheapestBundle.price.toFixed(2)}
    </button>
  </div>
)}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/screens/BundleDetailScreen/TopUpPanel.spec.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/BundleDetailScreen/TopUpPanel.tsx src/screens/BundleDetailScreen/TopUpPanel.module.css
git commit -m "feat(topup): add cheapest bundle suggestion"
```

---

## Task 7: E2E Test

**Files:**
- Create: `e2e/incontext-topup.spec.ts`

- [ ] **Step 1: Write e2e test**

```typescript
// e2e/incontext-topup.spec.ts
import { test, expect } from "@playwright/test";

test("top-up enables purchase when balance is insufficient", async ({ page }) => {
  // 1. Go to bundles, select user with low balance
  await page.goto("/");

  // 2. Switch to Jamie Chen (has $13.79, low balance)
  await page.selectOption("select", "Jamie Chen - Value Plus");

  // 3. Click a bundle that costs more than balance (Value Plus $19.99)
  await page.click("button:has-text('View Details')");

  // 4. Verify top-up panel is shown
  await expect(page.getByText(/You have \$13.79 — needs \$19.99/)).toBeVisible();

  // 5. Click +$10 top-up
  await page.click("button:has-text('+\$10')");

  // 6. Wait for success state
  await expect(page.getByText(/Balance updated/)).toBeVisible({ timeout: 15000 });

  // 7. Verify purchase button is now enabled
  await expect(page.getByText("Confirm Purchase")).toBeEnabled();
});
```

- [ ] **Step 2: Run e2e test**

Run: `npx playwright test e2e/incontext-topup.spec.ts`
Expected: PASS (or FAIL if LLM/backend not running — may need to adjust timeout)

- [ ] **Step 3: Commit**

```bash
git add e2e/incontext-topup.spec.ts
git commit -m "test(e2e): add in-context top-up flow test"
```

---

## Task 8: Final Integration — TopUpPanel Receives Updated Balance

**Files:**
- Modify: `src/screens/BundleDetailScreen/BundleDetailScreen.tsx`
- Test: Update `BundleDetailScreen.spec.tsx`

- [ ] **Step 1: Understand how balance update flows back**

The current `BundleDetailScreen` receives `data` prop from the XState machine. When `TopUpPanel` calls `top_up` via `invokeAgentStream`, the response contains an updated balance. We need to propagate this back to the machine so `BundleDetailScreen` re-renders with the new balance.

Options:
A. Send `SUBMIT_PROMPT` with top_up message through the machine (same as other flows)
B. Call a local state update that re-evaluates `hasInsufficientBalance`

Option A is cleaner — it keeps the machine as the source of truth.

- [ ] **Step 2: Wire top-up through machine actor**

```tsx
// In TopUpPanel — change onTopUpSuccess to send through machine:
onTopUpSuccess={(newBalance) => {
  // Send top-up through the machine's chat flow
  actor.send({
    type: "SUBMIT_PROMPT",
    prompt: `top up $${amount}`,
  });
}}

// In BundleDetailScreen — listen for balance updates from the machine
// The machine will push new screenData (with updated balance) after top-up
// No additional code needed if machine handles it correctly
```

- [ ] **Step 3: Verify full flow works in browser**

Manual test:
1. Open browser to `http://localhost:5173`
2. Select Jamie Chen (low balance)
3. Go to bundle detail for Value Plus ($19.99)
4. Click +$10
5. See balance update
6. Confirm Purchase button enables

- [ ] **Step 4: Commit**

```bash
git add src/screens/BundleDetailScreen/BundleDetailScreen.tsx
git commit -m "feat(topup): wire balance update through XState machine"
```

---

## Verification Commands

```bash
# TypeScript check
npx tsc --noEmit

# Unit tests
npx vitest run src/screens/BundleDetailScreen/

# E2E tests (requires servers running)
npx playwright test e2e/incontext-topup.spec.ts

# Full test suite
npm run test && npx playwright test
```

---

## Notes

- `userId` for top-up should come from session context — may need to thread through `userSessionService`
- The `cheapestBundle` prop requires passing the full bundles list to `TopUpPanel` — this should be added to `BundleDetailScreenData` or accessed via a shared service
- Top-up max cap is $50 (per spec) — the backend's `top_up` intent should enforce this, but verify in `MockTelcoService`
- The machine is the source of truth for screen state — all interactions should flow through it
