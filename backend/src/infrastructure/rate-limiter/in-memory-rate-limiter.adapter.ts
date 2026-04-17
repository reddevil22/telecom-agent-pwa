import type { OnModuleDestroy } from "@nestjs/common";
import { SECURITY_LIMITS } from "../../domain/constants/security-constants";
import type { RateLimiterPort } from "../../domain/ports/rate-limiter.port";

interface RequestRecord {
  timestamps: number[];
}

export class InMemoryRateLimiterAdapter
  implements RateLimiterPort, OnModuleDestroy
{
  private readonly requests = new Map<string, RequestRecord>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(
      () => this.cleanup(),
      SECURITY_LIMITS.RATE_LIMIT_CLEANUP_INTERVAL_MS,
    );
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  async isAllowed(key: string, now: number): Promise<boolean> {
    const windowStart = now - SECURITY_LIMITS.RATE_LIMIT_WINDOW_MS;

    let record = this.requests.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.requests.set(key, record);
    }

    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
    if (record.timestamps.length >= SECURITY_LIMITS.RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }

    record.timestamps.push(now);
    return true;
  }

  reset(): void {
    this.requests.clear();
  }

  private cleanup(): void {
    const cutoff = Date.now() - SECURITY_LIMITS.RATE_LIMIT_WINDOW_MS;
    for (const [key, record] of this.requests) {
      record.timestamps = record.timestamps.filter((ts) => ts > cutoff);
      if (record.timestamps.length === 0) {
        this.requests.delete(key);
      }
    }
  }
}
