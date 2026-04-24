import type {
  Balance,
  Bundle,
  UsageEntry,
  SupportTicket,
  ConversationMessage,
} from "./index";

// ── Agent protocol (frontend ↔ backend contract) ──
// When NestJS backend is built: POST /api/agent/chat accepts AgentRequest, returns AgentResponse.

export interface AgentRequest {
  prompt: string;
  sessionId: string;
  userId: string;
  conversationHistory: ConversationMessage[];
  timestamp: number;
  confirmationAction?: {
    token: string;
    decision: "confirm" | "cancel";
  };
}

export type AgentErrorCode =
  | "ERR_RATE_LIMITED"
  | "ERR_LLM_TIMEOUT"
  | "ERR_LLM_UNAVAILABLE"
  | "ERR_TOOL_TEMPORARILY_UNAVAILABLE"
  | "ERR_TOOL_FAILED"
  | "ERR_INSUFFICIENT_BALANCE"
  | "ERR_INVALID_BUNDLE"
  | "ERR_PROMPT_BLOCKED"
  | "ERR_MAX_ITERATIONS";

export type ScreenType =
  | "balance"
  | "bundles"
  | "bundleDetail"
  | "usage"
  | "support"
  | "confirmation"
  | "account"
  | "dataGift"
  | "unknown";

// ── Screen data (discriminated union) ──

export interface BalanceScreenData {
  type: "balance";
  balance: Balance;
}

export interface BundlesScreenData {
  type: "bundles";
  bundles: Bundle[];
}

export interface BundleDetailScreenData {
  type: "bundleDetail";
  bundle: Bundle;
  currentBalance: Balance;
}

export interface UsageScreenData {
  type: "usage";
  usage: UsageEntry[];
}

export interface SupportScreenData {
  type: "support";
  tickets: SupportTicket[];
  faqItems: { question: string; answer: string }[];
}

export interface ConfirmationScreenData {
  type: "confirmation";
  title: string;
  status: "pending" | "success" | "error";
  message: string;
  details: Record<string, string | number>;
  updatedBalance?: Balance;
  requiresUserConfirmation?: boolean;
  confirmationToken?: string;
  actionType?: "top_up" | "purchase_bundle" | "create_ticket" | "share_data";
}

export interface AccountScreenData {
  type: "account";
  profile: {
    name: string;
    msisdn: string;
    plan: string;
    status: string;
    balance: Balance;
    billingCycleStart: string;
    billingCycleEnd: string;
  };
  activeSubscriptions: Array<{
    subscriptionId: string;
    bundleName: string;
    status: string;
    activatedAt: string;
    expiresAt: string;
    dataUsedMb: number;
    dataTotalMb: number;
    minutesUsed: number;
    minutesTotal: number;
    smsUsed: number;
    smsTotal: number;
  }>;
  recentTransactions: Array<{
    id: string;
    type: string;
    description: string;
    amount?: number;
    currency?: string;
    timestamp: string;
  }>;
  openTickets: Array<{
    id: string;
    status: string;
    subject: string;
    updatedAt: string;
  }>;
}

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

export interface UnknownScreenData {
  type: "unknown";
}

export type ScreenData =
  | BalanceScreenData
  | BundlesScreenData
  | BundleDetailScreenData
  | UsageScreenData
  | SupportScreenData
  | ConfirmationScreenData
  | AccountScreenData
  | DataGiftScreenData
  | UnknownScreenData;

export interface ProcessingStep {
  label: string;
  status: "pending" | "active" | "done" | "error";
}

export interface ToolResult {
  toolName: string;
  screenType: ScreenType;
  screenData: ScreenData;
}

export interface AgentResponse {
  screenType: ScreenType;
  screenData: ScreenData;
  replyText: string;
  suggestions: string[];
  confidence: number;
  processingSteps: ProcessingStep[];
  errorCode?: AgentErrorCode;
  supplementaryResults?: ToolResult[];
}
