# Implementation Plan: Bill & Invoice Management

## Overview

Add structured billing to the telecom agent: invoices with itemized charges, payment processing, payment history, payment method management, and auto-pay setup. This is a core telecom function that users expect.

**Why:** Billing is one of the most common reasons customers contact telecom support. The current app shows `recentTransactions` in AccountScreen but has no structured billing system — no invoices, no due dates, no payment processing, no overdue tracking.

**Scope:** 17 new files, 12 modified files, ~2,800 LOC. Recommended in 4 phases.

---

## Phased Approach

### Phase 1: View Current Bill + Payment History (Read-Only)
~1,200 LOC. Ship first.

- Generate invoices from existing usage data
- View current bill with itemized charges
- View payment history
- Overage projection based on burn rate

### Phase 2: Pay Bill + Payment Methods
~900 LOC.

- Process payments against invoices
- Save/manage payment methods (cards)
- Confirmation flow for payments
- Update invoice status on payment

### Phase 3: Auto-Pay Setup + Background Processing
~500 LOC.

- Enable/disable auto-pay
- Configure payment day (billing date vs due date)
- Configure payment type (full vs fixed amount)
- Background job to process auto-pay

### Phase 4: Overdue Detection + Suspension Warnings
~400 LOC.

- Detect overdue invoices
- Late fee calculation
- Suspension warnings
- Service suspension simulation

---

## User Journeys

### Journey 1: View Current Bill (Phase 1)

```
User: "How much do I owe?"
  or "Show my bill"

Agent: "Your current bill for May 2026:

  ┌─────────────────────────────────┐
  │  BILL SUMMARY                   │
  │  Plan: Prepaid Basic            │
  │  Period: May 1 – May 31         │
  │                                 │
  │  Base Plan          $9.99       │
  │  Data Usage         $0.00       │
  │  Voice Usage        $0.00       │
  │  SMS Usage          $0.00       │
  │  ─────────────────────────────  │
  │  TOTAL              $9.99       │
  │  Tax (8.75%)        $0.87       │
  │  ─────────────────────────────  │
  │  GRAND TOTAL        $10.86      │
  │                                 │
  │  Due: May 31, 2026  ● Pending   │
  └─────────────────────────────────┘

  [ Pay Now ]  [ Payment History ]"
```

### Journey 2: Pay Bill (Phase 2)

```
User: "Pay my bill"

Agent: "You have an outstanding balance of $10.86.

  ┌─────────────────────────────────┐
  │  PAYMENT                        │
  │  Amount: $10.86                 │
  │  Due: May 31, 2026              │
  │                                 │
  │  Payment Method:                │
  │  ● Visa ending 4242 (default)   │
  │                                 │
  │  [Confirm Payment]              │
  └─────────────────────────────────┘"

User: (confirms)

Agent: "Payment successful!

  ┌─────────────────────────────────┐
  │  PAYMENT CONFIRMED              │
  │  Amount: $10.86                 │
  │  Method: Visa •••• 4242         │
  │  Reference: PAY-20260501-AX7K   │
  │  New Balance: $39.14            │
  └─────────────────────────────────┘"
```

### Journey 3: Payment History (Phase 1)

```
User: "Show my payment history"

Agent: "Your recent payments:

  ┌─────────────────────────────────┐
  │  PAYMENT HISTORY                │
  │  May 1, 2026    $10.86  ✓ Paid  │
  │  Apr 1, 2026    $19.99  ✓ Paid  │
  │  Mar 1, 2026    $19.99  ✓ Paid  │
  │  Feb 1, 2026    $34.50  ✓ Paid  │
  │    (included $14.51 overage)    │
  │  Jan 1, 2026    $9.99   ✓ Paid  │
  │                                 │
  │  Average monthly: $18.89        │
  └─────────────────────────────────┘"
```

### Journey 4: Auto-Pay Setup (Phase 3)

```
User: "Set up auto-pay"

Agent: "I can set up automatic payments for your monthly bill.

  ┌─────────────────────────────────┐
  │  AUTO-PAY SETUP                 │
  │  Payment Method: Visa •••• 4242 │
  │  Payment Day: Billing date      │
  │  Amount: Full balance           │
  │                                 │
  │  [Confirm Auto-Pay]             │
  └─────────────────────────────────┘"

User: (confirms)

Agent: "Auto-pay is now active. Your bill will be charged to
Visa •••• 4242 on the 1st of each month."
```

### Journey 5: Overdue Warning (Phase 4)

```
Agent: "⚠️ Your bill from April 2026 is overdue.

  Amount: $19.99
  Was due: April 30, 2026
  Days overdue: 1

  Your service may be suspended if payment isn't received
  within 7 days.

  Would you like to pay now?"
```

---

## Data Model

### New Types

**File:** `backend/src/domain/types/billing.ts`

```typescript
export interface Invoice {
  id: string;                     // "INV-202605-001"
  userId: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: InvoiceStatus;
  createdAt: string;
  dueDate: string;
  paidAt: string | null;
}

export interface InvoiceLineItem {
  id: string;
  type: LineItemType;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export type LineItemType =
  | 'base_plan'       // Monthly plan fee
  | 'data_overage'    // Extra data beyond allowance
  | 'voice_overage'   // Extra minutes
  | 'sms_overage'     // Extra SMS
  | 'bundle_purchase' // Add-on bundle
  | 'credit'          // Account credit / refund
  | 'late_fee'        // Penalty for late payment
  | 'tax';            // Sales tax

export type InvoiceStatus =
  | 'draft'           // Being calculated
  | 'pending'         // Finalized, awaiting payment
  | 'partially_paid'  // Some payment received
  | 'paid'            // Fully paid
  | 'overdue'         // Past due date
  | 'suspended';      // Service suspended

export interface Payment {
  id: string;                    // "PAY-20260501-AX7K"
  userId: string;
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  reference: string;
  createdAt: string;
}

export type PaymentMethod =
  | { type: 'card'; id: string; lastFour: string; brand: string; expiry: string; isDefault: boolean }
  | { type: 'bank'; id: string; lastFour: string; bankName: string; isDefault: boolean };

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface AutoPayConfig {
  userId: string;
  enabled: boolean;
  paymentMethodId: string;
  paymentDay: 'billing_date' | 'due_date';
  paymentType: 'full' | 'fixed';
  fixedAmount: number | null;
  lastChargeAt: string | null;
  nextChargeAt: string | null;
  createdAt: string;
}
```

### Business Rules

```typescript
// backend/src/domain/constants/billing-constants.ts

export const OVERAGE_RATES = {
  data: 5.00,    // $5/GB
  voice: 0.10,   // $0.10/min
  sms: 0.05,     // $0.05/SMS
} as const;

export const TAX_RATE = 0.0875;  // 8.75%

export const LATE_FEE = 5.00;    // $5 after 7 days overdue

export const SUSPENSION_GRACE_DAYS = 7;

export const AUTOPAY_NOTIFY_DAYS = 2;
```

---

## Database Schema

### Migration 008: Billing Tables

**File:** `backend/src/infrastructure/data/migrations/008_billing.ts`

```sql
-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  billing_period_start TEXT NOT NULL,
  billing_period_end TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft','pending','partially_paid','paid','overdue','suspended')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  due_date TEXT NOT NULL,
  paid_at TEXT,
  FOREIGN KEY (user_id) REFERENCES telco_accounts(user_id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_period ON invoices(user_id, billing_period_start);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON invoice_line_items(invoice_id);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  amount REAL NOT NULL,
  method_type TEXT NOT NULL,
  method_last_four TEXT,
  method_brand TEXT,
  method_expiry TEXT,
  method_bank_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','completed','failed','refunded')),
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES telco_accounts(user_id),
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- Payment methods
CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('card','bank')),
  last_four TEXT NOT NULL,
  brand TEXT,
  expiry TEXT,
  bank_name TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES telco_accounts(user_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);

-- Auto-pay configuration
CREATE TABLE IF NOT EXISTS auto_pay_config (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  payment_method_id TEXT NOT NULL,
  payment_day TEXT NOT NULL DEFAULT 'billing_date'
    CHECK(payment_day IN ('billing_date','due_date')),
  payment_type TEXT NOT NULL DEFAULT 'full'
    CHECK(payment_type IN ('full','fixed')),
  fixed_amount REAL,
  last_charge_at TEXT,
  next_charge_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
);

-- Seed default payment methods for demo users
INSERT OR IGNORE INTO payment_methods (id, user_id, type, last_four, brand, expiry, is_default) VALUES
  ('pm-1', 'user-1', 'card', '4242', 'Visa', '12/28', 1),
  ('pm-2', 'user-2', 'card', '5678', 'Mastercard', '06/27', 1),
  ('pm-3', 'user-3', 'card', '9012', 'Visa', '03/29', 1);
```

---

## Domain Service: BillingService

**File:** `backend/src/domain/services/billing.service.ts`

Pure business logic — no framework dependencies.

```typescript
export class BillingService {
  // Generate invoice for current billing cycle
  generateInvoice(
    userId: string,
    account: TelcoAccount,
    subscriptions: ActiveSubscription[],
    recentPurchases: PurchaseRecord[],
  ): Invoice

  // Calculate line items from usage + plan + purchases
  calculateLineItems(
    account: TelcoAccount,
    subscriptions: ActiveSubscription[],
    recentPurchases: PurchaseRecord[],
  ): InvoiceLineItem[]

  // Calculate overage for a single metric
  calculateOverage(used: number, total: number, rate: number): number

  // Calculate tax
  calculateTax(subtotal: number): number

  // Process payment against invoice
  processPayment(
    invoice: Invoice,
    amount: number,
    method: PaymentMethod,
  ): Payment

  // Check for overdue invoices
  findOverdueInvoices(invoices: Invoice[]): Invoice[]

  // Check for suspension eligibility
  checkSuspension(invoices: Invoice[]): boolean

  // Generate IDs
  generateInvoiceId(period: string, sequence: number): string
  generatePaymentReference(): string
}
```

### Invoice Generation Algorithm

```typescript
generateInvoice(userId, account, subscriptions, recentPurchases): Invoice {
  // 1. Base plan fee (from plan name → price mapping)
  const basePrice = this.getPlanPrice(account.plan_name);
  const baseItem = {
    type: 'base_plan',
    description: `${account.plan_name} - Monthly Plan`,
    quantity: 1,
    unitPrice: basePrice,
    total: basePrice,
  };

  // 2. Overage charges (only if usage exceeds allowance)
  const overageItems: InvoiceLineItem[] = [];
  for (const sub of subscriptions) {
    const dataOverage = this.calculateOverage(
      sub.data_used_mb / 1024, sub.data_total_mb / 1024, OVERAGE_RATES.data,
    );
    if (dataOverage > 0) {
      overageItems.push({
        type: 'data_overage',
        description: `Data overage (${(sub.data_used_mb/1024).toFixed(1)} GB used)`,
        quantity: sub.data_used_mb / 1024,
        unitPrice: OVERAGE_RATES.data,
        total: dataOverage,
      });
    }
    // ... same for voice and sms
  }

  // 3. Bundle purchases during this billing cycle
  const bundleItems = recentPurchases
    .filter(p => p.purchasedAt >= account.billing_cycle_start)
    .map(p => ({
      type: 'bundle_purchase',
      description: `Purchased ${p.bundleName}`,
      quantity: 1,
      unitPrice: p.price,
      total: p.price,
    }));

  // 4. Calculate totals
  const lineItems = [baseItem, ...overageItems, ...bundleItems];
  const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
  const tax = this.calculateTax(subtotal);
  const total = subtotal + tax;

  return {
    id: this.generateInvoiceId(account.billing_period_start.slice(0, 7)),
    userId,
    billingPeriodStart: account.billing_cycle_start,
    billingPeriodEnd: account.billing_cycle_end,
    lineItems,
    subtotal,
    tax,
    total,
    amountPaid: 0,
    balanceDue: total,
    status: 'pending',
    createdAt: new Date().toISOString(),
    dueDate: account.billing_cycle_end,
    paidAt: null,
  };
}
```

---

## Ports

**File:** `backend/src/domain/ports/billing.port.ts`

```typescript
export interface BillingPort {
  getCurrentInvoice(userId: string): Promise<Invoice | null>;
  getInvoiceHistory(userId: string, limit?: number): Promise<Invoice[]>;
  getInvoice(invoiceId: string, userId: string): Promise<Invoice | null>;
  payInvoice(userId: string, invoiceId: string, amount: number, methodId: string): Promise<Payment>;
  getPaymentHistory(userId: string, limit?: number): Promise<Payment[]>;
  getPayment(paymentId: string, userId: string): Promise<Payment | null>;
}

export interface PaymentMethodPort {
  getPaymentMethods(userId: string): Promise<PaymentMethod[]>;
  addPaymentMethod(userId: string, method: Omit<PaymentMethod, 'id'>): Promise<PaymentMethod>;
  setDefaultPaymentMethod(userId: string, methodId: string): Promise<void>;
  removePaymentMethod(userId: string, methodId: string): Promise<void>;
}

export interface AutoPayPort {
  getAutoPayConfig(userId: string): Promise<AutoPayConfig | null>;
  enableAutoPay(userId: string, config: Partial<AutoPayConfig>): Promise<AutoPayConfig>;
  disableAutoPay(userId: string): Promise<void>;
  processAutoPayTick(): Promise<AutoPayResult[]>;
}
```

---

## Sub-Agents

### New Sub-Agent Implementations

| File | Class | Phase |
|---|---|---|
| `view-bill-sub-agent.service.ts` | ViewBillSubAgent | 1 |
| `payment-history-sub-agent.service.ts` | PaymentHistorySubAgent | 1 |
| `pay-bill-sub-agent.service.ts` | PayBillSubAgent | 2 |
| `payment-methods-sub-agent.service.ts` | PaymentMethodsSubAgent | 2 |
| `auto-pay-sub-agent.service.ts` | AutoPaySubAgent | 3 |

### Registration

**File:** `backend/src/application/sub-agents/billing-agents.provider.ts` — expand:

```typescript
export function createBillingAgentRegistrations(
  balanceBff: BalanceBffPort,
  billingPort: BillingPort,
  paymentMethodPort: PaymentMethodPort,
  autoPayPort: AutoPayPort,
  telco: MockTelcoService,
  billingService: BillingService,
): SubAgentRegistration[] {
  return [
    // Existing
    { toolName: "check_balance", agent: new SimpleQuerySubAgent(...) },
    { toolName: "top_up", agent: new ActionSubAgent(...) },

    // Phase 1
    { toolName: "view_bill", agent: new ViewBillSubAgent(billingPort, telco, billingService) },
    { toolName: "payment_history", agent: new PaymentHistorySubAgent(billingPort) },

    // Phase 2
    { toolName: "pay_bill", agent: new PayBillSubAgent(billingPort, paymentMethodPort) },
    { toolName: "manage_payment_methods", agent: new PaymentMethodSubAgent(paymentMethodPort) },

    // Phase 3
    { toolName: "setup_auto_pay", agent: new AutoPaySubAgent(autoPayPort, paymentMethodPort) },
  ];
}
```

---

## New Tools

**File:** `backend/src/domain/constants/tool-registry.ts` — add 5 entries:

```typescript
view_bill: {
  name: "view_bill",
  screenType: "bill",
  allowedArgs: ["userId"],
  replyText: "Here is your current bill.",
  suggestions: ["Pay my bill", "Payment history", "Set up auto-pay"],
  description: "View the user's current bill with itemized charges. Use when the user asks about their bill, how much they owe, or what they're being charged for.",
  parameters: { type: "object", properties: { userId: { type: "string" } }, required: ["userId"] },
},

pay_bill: {
  name: "pay_bill",
  screenType: "confirmation",
  allowedArgs: ["userId", "invoiceId", "amount", "methodId"],
  replyText: "Your payment has been processed.",
  suggestions: ["Show my bill", "Payment history", "Set up auto-pay"],
  description: "Pay the user's outstanding bill. Requires invoice ID, amount, and payment method ID. Use only after the user has confirmed they want to pay.",
  parameters: { type: "object", properties: { userId: { type: "string" }, invoiceId: { type: "string" }, amount: { type: "string" }, methodId: { type: "string" } }, required: ["userId", "invoiceId", "amount", "methodId"] },
},

payment_history: {
  name: "payment_history",
  screenType: "paymentHistory",
  allowedArgs: ["userId"],
  replyText: "Here is your payment history.",
  suggestions: ["Pay my bill", "Show my bill", "Set up auto-pay"],
  description: "View the user's payment history. Use when the user asks about past payments or their payment record.",
  parameters: { type: "object", properties: { userId: { type: "string" } }, required: ["userId"] },
},

manage_payment_methods: {
  name: "manage_payment_methods",
  screenType: "paymentMethods",
  allowedArgs: ["userId"],
  replyText: "Here are your saved payment methods.",
  suggestions: ["Add a card", "Set default", "Remove a method"],
  description: "View and manage the user's saved payment methods. Use when the user asks about payment methods or wants to add/remove a card.",
  parameters: { type: "object", properties: { userId: { type: "string" } }, required: ["userId"] },
},

setup_auto_pay: {
  name: "setup_auto_pay",
  screenType: "autoPay",
  allowedArgs: ["userId", "action", "methodId", "paymentDay", "paymentType"],
  replyText: "Your auto-pay settings have been updated.",
  suggestions: ["View my bill", "Payment history", "Manage payment methods"],
  description: "Set up, modify, or disable automatic payments. Actions: enable, disable, update. Use when the user asks about auto-pay or recurring payments.",
  parameters: { type: "object", properties: { userId: { type: "string" }, action: { type: "string", enum: ["enable","disable","update"] }, methodId: { type: "string" }, paymentDay: { type: "string", enum: ["billing_date","due_date"] }, paymentType: { type: "string", enum: ["full","fixed"] } }, required: ["userId", "action"] },
},
```

---

## New Intents

**File:** `backend/src/domain/types/intent.ts`

```typescript
export enum TelecomIntent {
  // ... existing
  VIEW_BILL = 'view_bill',
  PAY_BILL = 'pay_bill',
  PAYMENT_HISTORY = 'payment_history',
  MANAGE_PAYMENT_METHODS = 'manage_payment_methods',
  SETUP_AUTO_PAY = 'setup_auto_pay',
}

// Tier 1 (keyword-routable):
export type Tier1Intent =
  | TelecomIntent.CHECK_BALANCE
  | TelecomIntent.CHECK_USAGE
  | TelecomIntent.BROWSE_BUNDLES
  | TelecomIntent.GET_SUPPORT
  | TelecomIntent.ACCOUNT_SUMMARY
  | TelecomIntent.GET_PLAN_ADVICE
  | TelecomIntent.VIEW_BILL          // NEW
  | TelecomIntent.PAYMENT_HISTORY    // NEW
  | TelecomIntent.SETUP_AUTO_PAY;    // NEW

export const INTENT_KEYWORDS: IntentKeywordMap = {
  // ... existing
  [TelecomIntent.VIEW_BILL]: [
    'bill', 'invoice', 'how much do i owe', 'what do i owe',
    'my charges', 'monthly bill', 'current bill',
  ],
  [TelecomIntent.PAYMENT_HISTORY]: [
    'payment history', 'past payments', 'payment record', 'have i paid', 'my payments',
  ],
  [TelecomIntent.SETUP_AUTO_PAY]: [
    'auto pay', 'autopay', 'automatic payment', 'recurring payment', 'set up auto',
  ],
};
```

**File:** `backend/data/intent-keywords.json` — add corresponding keyword arrays.

---

## New Screen Types

**File:** `backend/src/domain/types/agent.ts`

```typescript
export type ScreenType =
  // ... existing
  | "bill"
  | "paymentHistory"
  | "paymentMethods"
  | "autoPay";

export interface BillScreenData {
  type: "bill";
  invoice: Invoice;
  usageSummary: UsageEntry[];
  projectedOverage?: { data: number; voice: number; sms: number; total: number };
}

export interface PaymentHistoryScreenData {
  type: "paymentHistory";
  payments: Payment[];
  averageMonthlySpend: number;
  totalPaidThisYear: number;
}

export interface PaymentMethodsScreenData {
  type: "paymentMethods";
  methods: PaymentMethod[];
}

export interface AutoPayScreenData {
  type: "autoPay";
  config: AutoPayConfig | null;
  availableMethods: PaymentMethod[];
  nextBillAmount: number;
  nextChargeDate: string;
}
```

---

## Frontend Screens

### Phase 1 Screens

**`src/screens/BillScreen/`**
- `BillScreen.tsx` — Main screen
- `InvoiceSummary.tsx` — Total, due date, status badge
- `LineItemList.tsx` — Itemized charges table
- `UsageMeter.tsx` — Current usage with progress bars
- `OverageProjection.tsx` — "You may owe $X more by month end"
- `BillScreen.module.css`

**`src/screens/PaymentHistoryScreen/`**
- `PaymentHistoryScreen.tsx` — Main screen
- `PaymentRow.tsx` — Single payment entry
- `SpendSummary.tsx` — Average monthly, yearly total
- `PaymentHistoryScreen.module.css`

### Phase 2 Screens

**`src/screens/PaymentMethodsScreen/`**
- `PaymentMethodsScreen.tsx` — Main screen
- `PaymentMethodCard.tsx` — Card/bank display
- `AddMethodDialog.tsx` — Add new card dialog
- `PaymentMethodsScreen.module.css`

### Phase 3 Screens

**`src/screens/AutoPayScreen/`**
- `AutoPayScreen.tsx` — Main screen
- `AutoPayToggle.tsx` — On/off switch
- `AutoPayConfig.tsx` — Configuration form
- `AutoPayScreen.module.css`

### Other Changes

- `src/screens/registry.ts` — Register all 4 new screens
- `src/types/screens.ts` — Add screen data types
- `src/components/QuickActionBar/QuickActionBar.tsx` — Add "Billing" button (6th button)
- `src/screens/AccountScreen/AccountScreen.tsx` — Add "Outstanding Balance" card

---

## Infrastructure Layer

### Data Mappers

**Files:**
- `backend/src/infrastructure/data/invoice-data.mapper.ts` — Invoice CRUD via SQLite
- `backend/src/infrastructure/data/payment-data.mapper.ts` — Payment CRUD via SQLite
- `backend/src/infrastructure/data/payment-method-data.mapper.ts` — Payment method CRUD
- `backend/src/infrastructure/data/auto-pay-data.mapper.ts` — Auto-pay config CRUD

### Mock Telco Enhancements

**File:** `backend/src/infrastructure/telco/mock-telco.service.ts` — add:

```typescript
// Invoice generation
generateInvoiceForUser(userId: string): Invoice

// Payment processing
processPayment(userId: string, invoiceId: string, amount: number, methodId: string): Payment

// Auto-pay processing (called by scheduled job)
processAutoPay(): AutoPayResult[]

// Overdue detection
findOverdueInvoices(): Invoice[]

// Late fee application
applyLateFees(): void

// Service suspension check
checkSuspensionEligibility(userId: string): boolean
```

### Background Job (Phase 3)

Auto-pay processing runs as a scheduled task (e.g., cron or NestJS `@Interval`):

```typescript
// Called daily — processes auto-pay for invoices due today
async processAutoPayTick(): Promise<void> {
  const results = await this.autoPayPort.processAutoPayTick();
  for (const result of results) {
    if (result.success) {
      this.logger.log(`Auto-pay processed for ${result.userId}`);
    } else {
      this.logger.warn(`Auto-pay failed for ${result.userId}: ${result.error}`);
    }
  }
}
```

---

## Files Changed Summary

### Phase 1 (View Bill + Payment History)

| File | Action |
|---|---|
| `backend/src/domain/types/billing.ts` | **NEW** |
| `backend/src/domain/constants/billing-constants.ts` | **NEW** |
| `backend/src/domain/services/billing.service.ts` | **NEW** |
| `backend/src/domain/ports/billing.port.ts` | **NEW** |
| `backend/src/infrastructure/data/migrations/008_billing.ts` | **NEW** |
| `backend/src/infrastructure/data/invoice-data.mapper.ts` | **NEW** |
| `backend/src/infrastructure/data/payment-data.mapper.ts` | **NEW** |
| `backend/src/application/sub-agents/view-bill-sub-agent.service.ts` | **NEW** |
| `backend/src/application/sub-agents/payment-history-sub-agent.service.ts` | **NEW** |
| `backend/src/screens/BillScreen/` (6 files) | **NEW** |
| `backend/src/screens/PaymentHistoryScreen/` (4 files) | **NEW** |
| `backend/src/domain/types/intent.ts` | Modify |
| `backend/src/domain/types/agent.ts` | Modify |
| `backend/src/domain/constants/tool-registry.ts` | Modify |
| `backend/data/intent-keywords.json` | Modify |
| `backend/src/application/sub-agents/billing-agents.provider.ts` | Modify |
| `backend/src/app.agent-module.ts` | Modify |
| `backend/src/infrastructure/telco/mock-telco.service.ts` | Modify |
| `backend/src/application/supervisor/system-prompt.ts` | Modify |
| `src/screens/registry.ts` | Modify |
| `src/types/screens.ts` | Modify |
| `src/components/QuickActionBar/QuickActionBar.tsx` | Modify |

### Phase 2 (Pay Bill + Payment Methods)

| File | Action |
|---|---|
| `backend/src/domain/ports/payment-method.port.ts` | **NEW** |
| `backend/src/infrastructure/data/payment-method-data.mapper.ts` | **NEW** |
| `backend/src/application/sub-agents/pay-bill-sub-agent.service.ts` | **NEW** |
| `backend/src/application/sub-agents/payment-methods-sub-agent.service.ts` | **NEW** |
| `src/screens/PaymentMethodsScreen/` (4 files) | **NEW** |

### Phase 3 (Auto-Pay)

| File | Action |
|---|---|
| `backend/src/domain/ports/auto-pay.port.ts` | **NEW** |
| `backend/src/infrastructure/data/auto-pay-data.mapper.ts` | **NEW** |
| `backend/src/application/sub-agents/auto-pay-sub-agent.service.ts` | **NEW** |
| `src/screens/AutoPayScreen/` (4 files) | **NEW** |

### Phase 4 (Overdue + Suspension)

| File | Action |
|---|---|
| `backend/src/infrastructure/telco/mock-telco.service.ts` | Modify — add overdue/suspension logic |
| `backend/src/application/supervisor/supervisor.service.ts` | Modify — check overdue on requests |
| `src/components/DegradedBanner/` | Modify — add overdue warning variant |

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Financial state consistency | All payments in transactions; invoice status transitions are atomic |
| Payment method storage | Mock only — no real card data. In production, use a payment processor tokenization |
| Auto-pay background job | Use NestJS `@Interval` or system cron; idempotent processing |
| Overdue edge cases | Clear state machine: draft → pending → overdue → suspended; never skip states |
| Screen cache safety | Bill screen is explicitly excluded from screen cache (financial data must be fresh) |
| Tax rate variability | Configurable via env var; default 8.75% |
| Multi-currency | Not supported in mock; all USD. Add currency field to Invoice if needed |

---

## Testing Strategy

| Layer | Tests |
|---|---|
| BillingService | Unit tests for invoice generation, overage calculation, tax, payment processing |
| Sub-agents | Unit tests for each sub-agent's handle() method |
| Data mappers | Integration tests against test SQLite database |
| E2E | Playwright tests for bill view, payment flow, auto-pay setup |
| Degraded mode | Verify billing works when LLM is down (Tier 1 keyword routing) |
