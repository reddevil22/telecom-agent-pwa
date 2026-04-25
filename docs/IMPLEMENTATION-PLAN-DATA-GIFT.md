# Implementation Plan: Data Gifting Journey

**Feature:** Share Data with Someone  
**Status:** Ready for Development  
**Target:** Feature branch → merge after review  
**Effort Estimate:** 1–1.5 developer-days  
**Depends on:** No open blockers  

---

## 1. Goal

Enable users to gift data allowance from their active bundles to friends or family members. This demonstrates Tier 3 entity extraction, gated confirmation, and two-party transaction validation within the existing hexagonal backend and XState frontend.

---

## 2. User Flow

```
User:  "Share 2 GB with Jamie"
Agent: [Tier 3: LLM extracts recipient="Jamie", amount="2 GB"]
       → Calls share_data tool
       → Backend resolves recipient, validates sender allowance
       → Returns data-gift review screen

Screen: "Send 2.0 GB to Jamie Chen (+12025555678)?
         Source: Value Plus (10 GB)
         Remaining after transfer: 8.0 GB"
         [Confirm] [Cancel]

User:  [Clicks Confirm]
Agent: → Backend executes transfer, records transaction
       → Returns success screen

Screen: "Data shared successfully!
         Sent: 2.0 GB to Jamie Chen
         Your remaining data: 8.0 GB"
```

---

## 3. Backend Changes

### 3.1 Domain Layer

#### 3.1.1 Intent Taxonomy (`domain/types/intent.ts`)
```typescript
export enum TelecomIntent {
  // ... existing intents
  SHARE_DATA = 'share_data',
}

export type Tier1Intent =
  // ... existing Tier1 intents
  // NOTE: SHARE_DATA is NOT Tier 1 — it requires entity extraction (recipient + amount)
```

#### 3.1.2 Tool Registry (`domain/constants/tool-registry.ts`)
```typescript
export const TOOL_REGISTRY: Record<string, ToolMetadata> = {
  // ... existing tools
  share_data: {
    name: "share_data",
    screenType: "dataGift",
    allowedArgs: ["userId", "recipientQuery", "amount"],
    replyText: "Review your data gift before confirming.",
    suggestions: ["Show my balance", "Check my usage", "What bundles are available?"],
    description:
      "Share or gift data from the user's active bundle to another person. " +
      "Extract the recipient (name or phone number) and amount (e.g. '2 GB', '500 MB'). " +
      "ALWAYS call this tool first — the backend will show a review screen. " +
      "NEVER skip the review step.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The user ID" },
        recipientQuery: {
          type: "string",
          description: "Name or phone number of the recipient (e.g. 'Jamie', '+12025555678')",
        },
        amount: {
          type: "string",
          description: "Amount to share (e.g. '2 GB', '500 MB', '1.5GB')",
        },
      },
      required: ["userId", "recipientQuery", "amount"],
    },
  },
};
```

#### 3.1.3 Argument Constraints
```typescript
export const TOOL_ARG_CONSTRAINTS: ToolArgConstraints = {
  // ... existing constraints
  share_data: {
    userId: { maxLength: 64 },
    recipientQuery: { maxLength: 64 },
    amount: { maxLength: 16, pattern: /^\d+(\.\d+)?\s*(GB|MB|gb|mb)$/i },
  },
};
```

#### 3.1.4 New BFF Port (`domain/ports/bff-ports.ts`)
```typescript
export interface DataTransferResult {
  success: boolean;
  message: string;
  senderBalance: Balance;
  recipientName: string;
  recipientMsisdn: string;
  amountMb: number;
  sourceBundleName: string;
  remainingMb: number;
}

export interface DataGiftBffPort {
  resolveRecipient(userId: string, query: string): Promise<{ userId: string; name: string; msisdn: string } | null>;
  validateAllowance(userId: string, amountMb: number): Promise<{ valid: boolean; sourceBundleName: string; availableMb: number }>;
  transferData(senderId: string, recipientId: string, amountMb: number): Promise<DataTransferResult>;
}
```

#### 3.1.5 DI Token (`domain/tokens.ts`)
```typescript
export const DATA_GIFT_BFF_PORT = Symbol("DATA_GIFT_BFF_PORT");
```

### 3.2 Application Layer

#### 3.2.1 Sub-Agent (`application/sub-agents/data-gift-sub-agent.service.ts`)
```typescript
export class DataGiftSubAgent implements SubAgentPort {
  constructor(private readonly bff: DataGiftBffPort) {}

  async handle(userId: string, args: Record<string, string>): Promise<SubAgentResult> {
    const recipient = await this.bff.resolveRecipient(userId, args.recipientQuery);
    if (!recipient) {
      return this.buildErrorScreen("Recipient not found. Please check the name or number.");
    }

    const amountMb = this.parseAmount(args.amount);
    if (amountMb <= 0) {
      return this.buildErrorScreen("Invalid amount. Please specify a value like '2 GB' or '500 MB'.");
    }

    const validation = await this.bff.validateAllowance(userId, amountMb);
    if (!validation.valid) {
      return this.buildErrorScreen(
        `Insufficient data allowance. You have ${validation.availableMb} MB available.`,
      );
    }

    // Return review screen (gated — confirmation required)
    return {
      screenData: {
        type: "dataGift",
        status: "pending",
        title: "Review Data Gift",
        message: `Send ${this.formatMb(amountMb)} to ${recipient.name} (${recipient.msisdn})?`,
        details: {
          recipientName: recipient.name,
          recipientMsisdn: recipient.msisdn,
          amountMb,
          sourceBundleName: validation.sourceBundleName,
          remainingMb: validation.availableMb - amountMb,
        },
        requiresUserConfirmation: true,
        confirmationToken: randomUUID(),
        actionType: "share_data",
      } as ScreenData,
      processingSteps: [
        { label: "Finding recipient", status: "done" },
        { label: "Checking your allowance", status: "done" },
        { label: "Awaiting confirmation", status: "active" },
      ],
    };
  }

  private parseAmount(amount: string): number {
    const match = amount.match(/^(\d+(?:\.\d+)?)\s*(GB|MB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    return unit === "GB" ? Math.round(value * 1024) : Math.round(value);
  }

  private formatMb(mb: number): string {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  }

  private buildErrorScreen(message: string): SubAgentResult {
    return {
      screenData: {
        type: "confirmation",
        title: "Unable to Share Data",
        status: "error",
        message,
        details: {},
      } as ScreenData,
      processingSteps: [{ label: "Validating request", status: "done" }],
    };
  }
}
```

#### 3.2.2 Provider Registration (`application/sub-agents/data-gift-agents.provider.ts`)
```typescript
export function createDataGiftAgentRegistrations(bff: DataGiftBffPort): SubAgentRegistration[] {
  return [{ toolName: "share_data", agent: new DataGiftSubAgent(bff) }];
}
```

#### 3.2.3 Confirmation Execution (in `SupervisorService`)
Extend `tryHandleConfirmationAction` to handle `share_data` as a gated tool:

```typescript
private isGatedTool(toolName: string): toolName is GatedToolName {
  return toolName === "top_up" || toolName === "create_ticket" || toolName === "share_data";
}
```

On confirmation:
```typescript
const result = await this.dataGiftBff.transferData(request.userId, pending.args.recipientId, pending.args.amountMb);
```

### 3.3 Adapters Layer

#### 3.3.1 BFF Adapter (`adapters/driven/bff/data-gift/data-gift-bff.adapter.ts`)
```typescript
@Injectable()
export class DataGiftBffAdapter implements DataGiftBffPort {
  constructor(private readonly telco: MockTelcoService) {}

  async resolveRecipient(userId: string, query: string) {
    return this.telco.resolveRecipient(query);
  }

  async validateAllowance(userId: string, amountMb: number) {
    return this.telco.validateDataAllowance(userId, amountMb);
  }

  async transferData(senderId: string, recipientId: string, amountMb: number) {
    return this.telco.transferData(senderId, recipientId, amountMb);
  }
}
```

#### 3.3.2 Module Registration (`app.agent-module.ts`)
```typescript
import { DataGiftBffModule } from "./adapters/driven/bff/data-gift/data-gift-bff.module";
import { DATA_GIFT_BFF_PORT } from "./domain/tokens";
import { createDataGiftAgentRegistrations } from "./application/sub-agents/data-gift-agents.provider";

@Module({
  imports: [
    // ... existing imports
    DataGiftBffModule,
  ],
  providers: [
    // ... existing providers
    {
      provide: SupervisorService,
      useFactory: (
        // ... existing injections
        dataGiftBff: DataGiftBffPort,
      ) => {
        // ... existing setup
        registerSubAgents(supervisor, createDataGiftAgentRegistrations(dataGiftBff));
        return supervisor;
      },
      inject: [
        // ... existing tokens
        DATA_GIFT_BFF_PORT,
      ],
    },
  ],
})
```

### 3.4 Infrastructure Layer

#### 3.4.1 MockTelcoService Extension (`infrastructure/telco/mock-telco.service.ts`)
```typescript
// ── Data Gifting ──

resolveRecipient(query: string): { userId: string; name: string; msisdn: string } | null {
  const lower = query.toLowerCase().trim();
  const rows = this.db.prepare("SELECT user_id, name, msisdn FROM telco_accounts").all() as Array<{
    user_id: string;
    name: string;
    msisdn: string;
  }>;

  for (const row of rows) {
    if (row.user_id === lower || row.name.toLowerCase().includes(lower) || row.msisdn.includes(query)) {
      return { userId: row.user_id, name: row.name, msisdn: row.msisdn };
    }
  }
  return null;
}

validateDataAllowance(userId: string, amountMb: number): {
  valid: boolean;
  sourceBundleName: string;
  availableMb: number;
} {
  const sub = this.db.prepare(`
    SELECT s.*, c.name as bundle_name
    FROM telco_subscriptions s
    JOIN telco_bundles_catalog c ON c.id = s.bundle_id
    WHERE s.user_id = ? AND s.status = 'active' AND s.expires_at > datetime('now')
    ORDER BY (s.data_total_mb - s.data_used_mb) DESC
    LIMIT 1
  `).get(userId) as {
    data_total_mb: number;
    data_used_mb: number;
    bundle_name: string;
  } | undefined;

  if (!sub) {
    return { valid: false, sourceBundleName: "", availableMb: 0 };
  }

  const available = sub.data_total_mb - sub.data_used_mb;
  return {
    valid: available >= amountMb,
    sourceBundleName: sub.bundle_name,
    availableMb: available,
  };
}

transferData(senderId: string, recipientId: string, amountMb: number): DataTransferResult {
  const senderAccount = this.requireAccount(senderId);
  const recipientAccount = this.getAccount(recipientId);
  if (!recipientAccount) {
    throw new Error("Recipient not found");
  }

  // Validate allowance
  const validation = this.validateDataAllowance(senderId, amountMb);
  if (!validation.valid) {
    throw new Error("Insufficient data allowance");
  }

  // Find source subscription with most available data
  const sourceSub = this.db.prepare(`
    SELECT s.* FROM telco_subscriptions s
    WHERE s.user_id = ? AND s.status = 'active' AND s.expires_at > datetime('now')
    ORDER BY (s.data_total_mb - s.data_used_mb) DESC
    LIMIT 1
  `).get(senderId) as { id: string; data_total_mb: number; data_used_mb: number };

  // Deduct from sender
  this.db.prepare("UPDATE telco_subscriptions SET data_used_mb = data_used_mb + ? WHERE id = ?")
    .run(amountMb, sourceSub.id);

  // Find or create recipient subscription
  const recipientSub = this.db.prepare(`
    SELECT * FROM telco_subscriptions
    WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')
    ORDER BY expires_at DESC
    LIMIT 1
  `).get(recipientId) as { id: string; data_total_mb: number } | undefined;

  if (recipientSub) {
    this.db.prepare("UPDATE telco_subscriptions SET data_total_mb = data_total_mb + ? WHERE id = ?")
      .run(amountMb, recipientSub.id);
  } else {
    // Create a gift subscription for recipient
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 86400000); // 7-day gift validity
    this.db.prepare(`
      INSERT INTO telco_subscriptions
      (id, user_id, bundle_id, status, data_total_mb, data_used_mb,
       minutes_total, minutes_used, sms_total, sms_used, activated_at, expires_at)
      VALUES (?, ?, 'gift', 'active', ?, 0, 0, 0, 0, 0, ?, ?)
    `).run(
      `gift-${randomUUID().slice(0, 8)}`,
      recipientId,
      amountMb,
      now.toISOString().split("T")[0],
      expiresAt.toISOString().split("T")[0],
    );
  }

  return {
    success: true,
    message: `Data shared successfully!`,
    senderBalance: this.accountToBalance(senderAccount),
    recipientName: recipientAccount.name,
    recipientMsisdn: recipientAccount.msisdn,
    amountMb,
    sourceBundleName: validation.sourceBundleName,
    remainingMb: validation.availableMb - amountMb,
  };
}
```

#### 3.4.2 Database Migration (`infrastructure/data/migrations/007_add_data_gift_support.ts`)
```typescript
import type { Database } from "better-sqlite3";

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS telco_data_transfers (
      id TEXT PRIMARY KEY,
      sender_user_id TEXT NOT NULL,
      recipient_user_id TEXT NOT NULL,
      amount_mb INTEGER NOT NULL,
      source_subscription_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_data_transfers_sender ON telco_data_transfers(sender_user_id);
    CREATE INDEX idx_data_transfers_recipient ON telco_data_transfers(recipient_user_id);
  `);
}

export function down(db: Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_data_transfers_sender;
    DROP INDEX IF EXISTS idx_data_transfers_recipient;
    DROP TABLE IF EXISTS telco_data_transfers;
  `);
}
```

---

## 4. Frontend Changes

### 4.1 New Screen Component

#### 4.1.1 `screens/DataGiftScreen/DataGiftScreen.tsx`
```typescript
import styles from "./DataGiftScreen.module.css";

interface Props {
  data: DataGiftScreenData;
}

export function DataGiftScreen({ data }: Props) {
  const isPending = data.status === "pending";
  const isSuccess = data.status === "success";
  const isError = data.status === "error";

  return (
    <div className={styles.container}>
      {isPending && (
        <>
          <h3 className={styles.title}>{data.title}</h3>
          <p className={styles.message}>{data.message}</p>
          <div className={styles.details}>
            <DetailRow label="Recipient" value={data.details.recipientName} />
            <DetailRow label="Phone" value={data.details.recipientMsisdn} />
            <DetailRow label="Amount" value={formatMb(data.details.amountMb)} />
            <DetailRow label="From Bundle" value={data.details.sourceBundleName} />
            <DetailRow
              label="Remaining After"
              value={formatMb(data.details.remainingMb)}
            />
          </div>
        </>
      )}

      {isSuccess && (
        <>
          <div className={styles.successIcon}>✓</div>
          <h3 className={styles.title}>{data.title}</h3>
          <p className={styles.message}>{data.message}</p>
          <div className={styles.details}>
            <DetailRow label="Sent To" value={data.details.recipientName} />
            <DetailRow label="Amount" value={formatMb(data.details.amountMb)} />
            <DetailRow label="Your Remaining Data" value={formatMb(data.details.remainingMb)} />
          </div>
        </>
      )}

      {isError && (
        <>
          <div className={styles.errorIcon}>✕</div>
          <h3 className={styles.title}>{data.title}</h3>
          <p className={styles.message}>{data.message}</p>
        </>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{value}</span>
    </div>
  );
}

function formatMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}
```

#### 4.1.2 `screens/DataGiftScreen/DataGiftScreen.module.css`
```css
.container {
  padding: var(--space-lg);
  background: var(--surface);
  border-radius: var(--radius-lg);
  max-width: 480px;
  margin: 0 auto;
}

.title {
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  color: var(--text-primary);
  margin-bottom: var(--space-sm);
}

.message {
  font-size: var(--text-base);
  color: var(--text-secondary);
  margin-bottom: var(--space-lg);
}

.details {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.detailRow {
  display: flex;
  justify-content: space-between;
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--border);
}

.detailLabel {
  color: var(--text-secondary);
  font-size: var(--text-sm);
}

.detailValue {
  color: var(--text-primary);
  font-weight: 600;
  font-size: var(--text-sm);
}

.successIcon {
  font-size: 2rem;
  color: var(--success);
  margin-bottom: var(--space-sm);
}

.errorIcon {
  font-size: 2rem;
  color: var(--error);
  margin-bottom: var(--space-sm);
}
```

### 4.2 Screen Registry Update

#### 4.2.1 `screens/registry.ts`
```typescript
const DataGiftScreen = lazy(async () => ({
  default: (await import("./DataGiftScreen/DataGiftScreen")).DataGiftScreen,
}));

export const screenRegistry: ScreenRegistry = new Map([
  // ... existing entries
  ["dataGift", { component: DataGiftScreen, displayName: "Data Gift" }],
]);
```

### 4.3 Type Definitions

#### 4.3.1 `types/agent.ts`
```typescript
export interface DataGiftScreenData {
  type: "dataGift";
  status: "pending" | "success" | "error";
  title: string;
  message: string;
  details: {
    recipientName: string;
    recipientMsisdn: string;
    amountMb: number;
    sourceBundleName: string;
    remainingMb: number;
  };
  requiresUserConfirmation?: boolean;
  confirmationToken?: string;
  actionType?: "share_data";
}

export type ScreenData =
  // ... existing screen types
  | DataGiftScreenData;
```

---

## 5. Security Considerations

| Layer | Rule | Implementation |
|-------|------|----------------|
| **Input** | Amount pattern validation | `^\d+(\.\d+)?\s*(GB\|MB\|gb\|mb)$` in `TOOL_ARG_CONSTRAINTS` |
| **Domain** | Self-transfer prevention | Reject if `recipientId === senderId` in `transferData` |
| **Domain** | Min/max limits | Enforce `amountMb >= 100` (100 MB min) and `amountMb <= 51200` (50 GB max) |
| **Domain** | Recipient whitelist | Only allow transfers to known accounts in `telco_accounts` |
| **Supervisor** | Gated confirmation | `share_data` added to `isGatedTool`; requires explicit token confirmation |
| **Rate limit** | Transfer frequency | Consider adding per-user daily transfer limit (future) |

---

## 6. Test Plan

### 6.1 Backend Unit Tests

| Test | File | Assertion |
|------|------|-----------|
| Intent router classifies "share 2 GB with Jamie" | `intent-router.service.spec.ts` | Returns `null` (falls through to Tier 3) |
| Tool validation accepts "2 GB" | `tool-validation.service.spec.ts` | Pattern match passes |
| Tool validation rejects "abc" | `tool-validation.service.spec.ts` | Pattern match fails |
| DataGiftSubAgent resolves recipient | `data-gift-sub-agent.service.spec.ts` | Returns review screen with correct details |
| DataGiftSubAgent rejects unknown recipient | `data-gift-sub-agent.service.spec.ts` | Returns error screen |
| DataGiftSubAgent rejects over-transfer | `data-gift-sub-agent.service.spec.ts` | Returns error screen |
| MockTelcoService.transferData deducts sender | `mock-telco.service.spec.ts` | Sender `data_used_mb` increases by amount |
| MockTelcoService.transferData credits recipient | `mock-telco.service.spec.ts` | Recipient `data_total_mb` increases by amount |

### 6.2 Frontend E2E Tests

| Test | File | Flow |
|------|------|------|
| "Share 1 GB with Jamie Chen" renders review screen | `e2e/data-gift.spec.ts` | Type prompt → verify review screen → verify Confirm/Cancel buttons |
| Confirm share shows success | `e2e/data-gift.spec.ts` | Click Confirm → verify success screen → verify remaining data updated |
| Cancel share returns to chat | `e2e/data-gift.spec.ts` | Click Cancel → verify chat view restored |
| "Share 100 GB" shows error | `e2e/data-gift.spec.ts` | Type prompt → verify error screen with insufficient data message |
| "Share with Unknown" shows error | `e2e/data-gift.spec.ts` | Type "Share 1 GB with Bob" → verify recipient-not-found error |
| Quick action "Share data" works | `e2e/data-gift.spec.ts` | Click quick action → verify review screen (future) |

### 6.3 Integration Tests

| Test | Endpoint | Payload | Expected |
|------|----------|---------|----------|
| POST /api/agent/chat | `{"prompt":"Share 2 GB with Jamie","userId":"user-1",...}` | `screenType: "dataGift"`, `status: "pending"` |
| POST /api/agent/chat (confirm) | `{"confirmationAction":{"token":"...","decision":"confirm"},...}` | `screenType: "dataGift"`, `status: "success"` |

---

## 7. Migration & Rollout

1. **Database:** Run migration `007_add_data_gift_support.ts` before deploying code.
2. **Backend:** Deploy new BFF adapter, sub-agent, and supervisor changes.
3. **Frontend:** Deploy `DataGiftScreen` and registry update.
4. **Smoke test:** Verify "Share 1 GB with Jamie" end-to-end on staging.
5. **Enable quick action:** Add `"Share data"` to `quick-actions.config.ts` after stable for 1 week.

---

## 8. Definition of Done

- [ ] All backend unit tests pass (`npm test` in `backend/`)
- [ ] All E2E tests pass (`npx playwright test` in root)
- [ ] `nest build` succeeds with zero errors
- [ ] `tsc -b && vite build` succeeds with zero errors
- [ ] ESLint passes for all modified files
- [ ] Feature works for all 3 demo users
- [ ] Degraded mode still allows data gifting via quick action (if enabled)
- [ ] AGENTS.md updated with new intent and screen type
- [ ] Migration is idempotent (can run `up` twice safely)

---

*Plan created 2026-04-24. Aligns with project conventions in AGENTS.md.*
