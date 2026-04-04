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

export type ScreenType = 'balance' | 'bundles' | 'usage' | 'support' | 'confirmation' | 'unknown';

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

// ── Streaming types (SSE) ──

export type StreamEventType =
  | 'step_start'
  | 'step_complete'
  | 'tool_call'
  | 'tool_result'
  | 'llm_content'
  | 'screen_ready'
  | 'complete'
  | 'error';

export interface StreamEventData {
  step?: ProcessingStep;
  stepIndex?: number;
  toolName?: string;
  screenType?: ScreenType;
  screenData?: ScreenData;
  content?: string;
  error?: string;
}

export interface StreamEvent {
  id: string;
  type: StreamEventType;
  timestamp: number;
  correlationId: string;
  data: StreamEventData;
}
