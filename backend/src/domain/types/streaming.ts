import type { ProcessingStep, ScreenType, ScreenData } from './agent';

export type StreamEventType =
  | 'step_start'
  | 'step_complete'
  | 'tool_call'
  | 'tool_result'
  | 'llm_content'
  | 'screen_ready'
  | 'complete'
  | 'error';

export interface StreamEvent {
  id: string;
  type: StreamEventType;
  timestamp: number;
  correlationId: string;
  data: StreamEventData;
}

export interface StreamEventData {
  step?: ProcessingStep;
  stepIndex?: number;
  toolName?: string;
  screenType?: ScreenType;
  screenData?: ScreenData;
  content?: string;
  error?: string;
}

export interface StreamingAgentRequest {
  prompt: string;
  sessionId: string;
  userId: string;
  conversationHistory: Array<{ role: 'user' | 'agent'; text: string; timestamp: number }>;
  timestamp: number;
}
