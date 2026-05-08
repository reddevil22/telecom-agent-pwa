import type { AgentResponse } from "../types/agent";

export interface BffResponseCachePort {
  get(userId: string, toolName: string): AgentResponse | null;
  set(userId: string, toolName: string, response: AgentResponse): void;
  invalidate(userId: string, toolName: string): void;
  invalidateAllForUser(userId: string): void;
}