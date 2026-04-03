import type { Balance, Bundle, UsageEntry, SupportTicket, ConversationMessage } from './index';

// ── Agent protocol (frontend ↔ backend contract) ──
// When NestJS backend is built: POST /api/agent/chat accepts AgentRequest, returns AgentResponse.

export interface AgentRequest {
  prompt: string;
  sessionId: string;
  userId: string;
  conversationHistory: ConversationMessage[];
  timestamp: number;
}

export type ScreenType = 'balance' | 'bundles' | 'usage' | 'support' | 'unknown';

// ── Screen data (discriminated union) ──

export interface BalanceScreenData {
  type: 'balance';
  balance: Balance;
}

export interface BundlesScreenData {
  type: 'bundles';
  bundles: Bundle[];
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

export interface UnknownScreenData {
  type: 'unknown';
}

export type ScreenData =
  | BalanceScreenData
  | BundlesScreenData
  | UsageScreenData
  | SupportScreenData
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
