import type { ScreenData, ProcessingStep } from '../types/agent';

export interface SubAgentPort {
  handle(userId: string): Promise<{ screenData: ScreenData; processingSteps: ProcessingStep[] }>;
}
