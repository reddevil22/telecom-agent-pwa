# In-Context Top-Up — Feature Spec

## Overview

**Feature:** In-Context Top-Up
**Type:** Customer-facing enhancement
**Status:** Draft
**Date:** 2026-04-19

---

## Problem Statement

When a customer attempts to purchase a bundle but has insufficient account balance, they must navigate away from their purchase context to the balance screen, add funds, and then return to complete the purchase. This multi-step flow causes drop-off and friction.

---

## Solution

Inline top-up within the **BundleDetailScreen** purchase confirmation section. When balance is insufficient, the confirmation button is replaced with a quick top-up panel. After a successful top-up, the purchase completes without the user leaving the screen.

---

## User Journey

1. User browses bundles → taps "View Details" on a bundle
2. User taps "Purchase" on the bundle detail screen
3. System checks available balance against bundle price
4. **If sufficient:** Purchase confirmation button is enabled
5. **If insufficient:** Inline top-up panel appears; confirm button stays disabled
6. User selects a top-up amount ($5, $10, $20, or custom)
7. Top-up is sent through the existing chat flow (`top_up` intent)
8. On success: Balance updates, confirmation button becomes enabled
9. User completes purchase normally

---

## UI Specification

### BundleDetailScreen — Insufficient Balance State

```
┌────────────────────────────────────────────┐
│  ← Back                      [Share]       │
├────────────────────────────────────────────┤
│                                            │
│  Value Plus                                │
│  10 GB · 500 min · 200 SMS                 │
│                                            │
│  $19.99 / 30 days                         │
│                                            │
│  ┌─ 💳 Insufficient balance ─────────────┐ │
│  │  You have $13.79 — needs $19.99       │ │
│  │                                        │ │
│  │  Quick top-up:                         │ │
│  │  [+$5]  [+$10]  [+$20]  [Custom]       │ │
│  │                                        │ │
│  │  After top-up, complete purchase       │ │
│  └────────────────────────────────────────┘ │
│                                            │
│  [ ✕ Cancel ]                              │
│                                            │
└────────────────────────────────────────────┘
```

### After Successful Top-Up

```
┌────────────────────────────────────────────┐
│  ← Back                      [Share]       │
├────────────────────────────────────────────┤
│                                            │
│  Value Plus                                │
│  10 GB · 500 min · 200 SMS                 │
│                                            │
│  $19.99 / 30 days                         │
│                                            │
│  ┌─ ✓ Top-up complete ────────────────────┐ │
│  │  Balance updated: $23.79               │ │
│  └────────────────────────────────────────┘ │
│                                            │
│  [ ✓ Confirm Purchase ]                    │
│                                            │
└────────────────────────────────────────────┘
```

### Top-Up in Progress

```
│  [▓▓▓▓▓▓▓▓░░░░] +$10 — Processing...     │
```

### Top-Up Failed

```
│  ┌─ ⚠ Top-up failed ──────────────────────┐ │
│  │  Could not add funds. Try again.       │ │
│  │  [Retry]                               │ │
│  └────────────────────────────────────────┘ │
```

### Still Insufficient After Top-Up

```
│  ┌─ 💳 Still short by $1.21 ──────────────┐ │
│  │  You now have $18.79                   │ │
│  │  [+$5]  [+$10]  [+$20]  [Custom]       │ │
│  └────────────────────────────────────────┘ │
```

### No Bundles Affordable — Show Cheapest Option

```
│  ┌─ 💳 Low balance — $3.50 ──────────────┐ │
│  │  You can't afford any bundles yet.     │ │
│  │                                        │ │
│  │  Least expensive option:               │ │
│  │  [ Weekend Pass — $4.99 ]              │ │
│  │                                        │ │
│  │  Or top up to purchase a bigger plan    │ │
│  │  [+$5]  [+$10]  [+$20]  [Custom]       │ │
│  └────────────────────────────────────────┘ │
```

---

## Component Structure

### State Machine

```
idle
  │
  ├─ balance >= price ──→ confirmEnabled
  │
  └─ balance < price
         │
         ▼
    showingTopupPanel
         │
         ├─ user selects amount
         │        │
         │        ▼
         │   topupPending ──→ (send top-up via chat)
         │        │
         │        ├─ success + sufficient ──→ confirmEnabled
         │        ├─ success + insufficient ──→ showingTopupPanel (updated balance)
         │        └─ failure ──→ topupFailed ──→ showingTopupPanel
         │
         └─ user cancels ──→ navigate back
```

### Props (topupPanel)

| Prop | Type | Description |
|------|------|-------------|
| `currentBalance` | `number` | User's current balance in dollars |
| `bundlePrice` | `number` | Price of the bundle being purchased |
| `onTopUpSuccess` | `(newBalance: number) => void` | Called after successful top-up |
| `onTopUpError` | `(error: string) => void` | Called after failed top-up |
| `onCancel` | `() => void` | Called when user cancels |
| `bundles` | `Bundle[]` | All available bundles (for cheapest suggestion) |

### Amount Presets

| Amount | Use Case |
|--------|----------|
| $5 | Low barrier, quick top-up |
| $10 | Most common, default suggestion |
| $20 | Power users |
| Custom | Keypad input, minimum $1 |

---

## API Flow

### Step 1 — Check Balance
Frontend already has `currentBalance` from the session state. No API call needed.

### Step 2 — Trigger Top-Up
Top-up uses the **existing chat flow**:

1. Frontend sends message: `"top up $10"` via `agentService.sendMessage()`
2. Backend resolves `top_up` intent, calls `MockTelcoService.topUp(userId, 10)`
3. Backend returns updated balance in response
4. Frontend receives `screenData` with new balance

### Step 3 — Refresh Confirmation Button
After top-up success, `currentBalance` is updated via the chat response. Re-evaluate: `balance >= price ? confirmEnabled : showingTopupPanel`.

---

## Cheapest Bundle Suggestion

When `currentBalance < cheapestBundlePrice`:

1. Sort all bundles by price ascending
2. Extract `cheapestBundle = bundles[0]`
3. Show cheapest bundle as a one-tap link below the top-up panel
4. Tapping it navigates to that bundle's detail screen

---

## Error Handling

| Error | User-Facing Message | Recovery |
|-------|---------------------|----------|
| Top-up API timeout | "Connection timed out. Try again." | Retry button |
| Top-up API 500 | "Something went wrong. Try again in a moment." | Retry button |
| Rate limit hit | "Too many requests. Wait a moment and try again." | Auto-retry after delay |
| Negative balance result | "Could not add funds. Contact support if this continues." | Show support button |

---

## Edge Cases

- **Exact balance match:** Skip top-up panel entirely, enable purchase directly
- **Top-up exceeds max ($50):** Cap at $50, show "Maximum top-up is $50"
- **User already has active version of this bundle:** Allow purchase anyway (stacking is allowed per FAQ)
- **Bundle price changes while user is on screen:** Re-evaluate balance on every render
- **Top-up during SSE stream:** Queue top-up completion until stream resolves, then update

---

## Non-Goals (Out of Scope)

- Persistent "auto top-up" setting
- Saved payment methods
- Top-up via separate screen
- Proactive balance alerts (separate feature)

---

## Dependencies

- Frontend: `agentService.sendMessage()`, session state for balance
- Backend: `top_up` intent already exists in IntentRouter + MockTelcoService
- No new API endpoints required

---

## File Changes

| File | Change |
|------|--------|
| `src/screens/BundleDetailScreen/` | Add inline top-up panel component |
| `src/services/agentService.ts` | Ensure `top_up` message passthrough works |
| `src/types/` | Add `TopUpState` type enum |
| `src/theme/tokens.css` | Add top-up panel color tokens if needed |
