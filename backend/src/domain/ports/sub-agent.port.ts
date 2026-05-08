import type { ScreenData, ProcessingStep } from '../types/agent';

export interface SubAgentPort {
  handle(
    userId: string,
    sessionId: string,
    params?: Record<string, string>,
  ): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }>;
}