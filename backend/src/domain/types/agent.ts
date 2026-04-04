import type { Balance, Bundle, UsageEntry, SupportTicket, ConversationMessage } from './domain';

// Re-export streaming types for convenience
export type {
  StreamEvent,
  StreamEventType,
  StreamEventData,
  StreamingAgentRequest,
} from './streaming';

export interface AgentRequest {
  prompt: string;
  sessionId: string;
  userId: string;
  conversationHistory: ConversationMessage[];
  timestamp: number;
}

export type ScreenType = 'balance' | 'bundles' | 'bundleDetail' | 'usage' | 'support' | 'confirmation' | 'unknown';

export interface BalanceScreenData {
  type: 'balance';
  balance: Balance;
}

export interface BundlesScreenData {
  type: 'bundles';
  bundles: Bundle[];
}

export interface BundleDetailScreenData {
  type: 'bundleDetail';
  bundle: Bundle;
  currentBalance: Balance;
}

export interface UsageScreenData {
  type: 'usage';
  usage: UsageEntry[];
}

export interface SupportScreenData {
  type: 'support';
  tickets: SupportTicket[];
  faqItems: { question: string; answer: string }[];
}

export interface ConfirmationScreenData {
  type: 'confirmation';
  title: string;
  status: 'success' | 'error';
  message: string;
  details: Record<string, string | number>;
  updatedBalance?: Balance;
}

export interface UnknownScreenData {
  type: 'unknown';
}

export type ScreenData =
  | BalanceScreenData
  | BundlesScreenData
  | BundleDetailScreenData
  | UsageScreenData
  | SupportScreenData
  | ConfirmationScreenData
  | UnknownScreenData;

export interface ProcessingStep {
  label: string;
  status: 'pending' | 'active' | 'done';
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
  supplementaryResults?: ToolResult[];
}
