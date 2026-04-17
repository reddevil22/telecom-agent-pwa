export interface MetricsSnapshot {
  counters: {
    intentResolutionByTier: Record<"tier1" | "tier2" | "tier3", number>;
    cacheHits: Record<"intent" | "screen", number>;
    cacheMisses: Record<"intent" | "screen", number>;
    llmCalls: number;
    llmTokens: number;
    toolCalls: number;
    toolFailures: number;
    toolTemporarilyDisabled: number;
    toolBlocked: number;
    toolRecovered: number;
    circuitBreakerTransitions: number;
  };
  latencies: {
    intentResolutionMsTotal: number;
    llmMsTotal: number;
    toolMsTotal: number;
  };
  toolStats: Record<
    string,
    { success: number; failure: number; latencyMsTotal: number }
  >;
  updatedAt: number;
}

export interface MetricsPort {
  recordIntentResolution(
    tier: 1 | 2 | 3,
    intent: string,
    latencyMs: number,
  ): void;
  recordLlmCall(model: string, tokensUsed: number, latencyMs: number): void;
  recordCacheHit(cacheType: "intent" | "screen", hit: boolean): void;
  recordToolCall(toolName: string, success: boolean, latencyMs: number): void;
  recordToolTemporarilyDisabled(toolName: string): void;
  recordToolBlocked(toolName: string): void;
  recordToolRecovered(toolName: string): void;
  recordCircuitBreakerTransition(from: string, to: string): void;
  getSnapshot(): MetricsSnapshot;
}
