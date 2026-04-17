import type {
  MetricsPort,
  MetricsSnapshot,
} from "../../domain/ports/metrics.port";

export class SimpleMetricsAdapter implements MetricsPort {
  private readonly snapshot: MetricsSnapshot = {
    counters: {
      intentResolutionByTier: { tier1: 0, tier2: 0, tier3: 0 },
      cacheHits: { intent: 0, screen: 0 },
      cacheMisses: { intent: 0, screen: 0 },
      llmCalls: 0,
      llmTokens: 0,
      toolCalls: 0,
      toolFailures: 0,
      toolTemporarilyDisabled: 0,
      toolBlocked: 0,
      toolRecovered: 0,
      circuitBreakerTransitions: 0,
    },
    latencies: {
      intentResolutionMsTotal: 0,
      llmMsTotal: 0,
      toolMsTotal: 0,
    },
    toolStats: {},
    updatedAt: Date.now(),
  };

  recordIntentResolution(
    tier: 1 | 2 | 3,
    _intent: string,
    latencyMs: number,
  ): void {
    if (tier === 1) this.snapshot.counters.intentResolutionByTier.tier1 += 1;
    if (tier === 2) this.snapshot.counters.intentResolutionByTier.tier2 += 1;
    if (tier === 3) this.snapshot.counters.intentResolutionByTier.tier3 += 1;
    this.snapshot.latencies.intentResolutionMsTotal += Math.max(0, latencyMs);
    this.snapshot.updatedAt = Date.now();
  }

  recordLlmCall(_model: string, tokensUsed: number, latencyMs: number): void {
    this.snapshot.counters.llmCalls += 1;
    this.snapshot.counters.llmTokens += Math.max(0, tokensUsed);
    this.snapshot.latencies.llmMsTotal += Math.max(0, latencyMs);
    this.snapshot.updatedAt = Date.now();
  }

  recordCacheHit(cacheType: "intent" | "screen", hit: boolean): void {
    if (hit) {
      this.snapshot.counters.cacheHits[cacheType] += 1;
    } else {
      this.snapshot.counters.cacheMisses[cacheType] += 1;
    }
    this.snapshot.updatedAt = Date.now();
  }

  recordToolCall(toolName: string, success: boolean, latencyMs: number): void {
    this.snapshot.counters.toolCalls += 1;
    if (!success) {
      this.snapshot.counters.toolFailures += 1;
    }

    const stats = this.snapshot.toolStats[toolName] ?? {
      success: 0,
      failure: 0,
      latencyMsTotal: 0,
    };
    if (success) {
      stats.success += 1;
    } else {
      stats.failure += 1;
    }
    stats.latencyMsTotal += Math.max(0, latencyMs);
    this.snapshot.toolStats[toolName] = stats;

    this.snapshot.latencies.toolMsTotal += Math.max(0, latencyMs);
    this.snapshot.updatedAt = Date.now();
  }

  recordToolTemporarilyDisabled(_toolName: string): void {
    this.snapshot.counters.toolTemporarilyDisabled += 1;
    this.snapshot.updatedAt = Date.now();
  }

  recordToolBlocked(_toolName: string): void {
    this.snapshot.counters.toolBlocked += 1;
    this.snapshot.updatedAt = Date.now();
  }

  recordToolRecovered(_toolName: string): void {
    this.snapshot.counters.toolRecovered += 1;
    this.snapshot.updatedAt = Date.now();
  }

  recordCircuitBreakerTransition(_from: string, _to: string): void {
    this.snapshot.counters.circuitBreakerTransitions += 1;
    this.snapshot.updatedAt = Date.now();
  }

  getSnapshot(): MetricsSnapshot {
    return structuredClone(this.snapshot);
  }
}
