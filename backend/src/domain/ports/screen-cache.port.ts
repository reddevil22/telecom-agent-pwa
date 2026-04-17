import type { AgentResponse, ScreenType } from '../types/agent';

export interface ScreenCachePort {
  get(userId: string, screenType: ScreenType): AgentResponse | null;
  set(userId: string, screenType: ScreenType, response: AgentResponse): void;
  invalidate(userId: string, screenType: ScreenType): void;
  invalidateAll(userId: string): void;
}
