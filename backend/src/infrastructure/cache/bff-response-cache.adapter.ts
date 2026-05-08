import type { OnModuleDestroy } from "@nestjs/common";
import type { AgentResponse } from "../../domain/types/agent";
import type { BffResponseCachePort } from "../../domain/ports/bff-response-cache.port";

/** TTL in milliseconds per tool name. null = not cacheable. */
const TOOL_CACHE_TTL_MS: Readonly<Record<string, number | null>> = {
  check_balance: 60_000,
  check_usage: 60_000,
  get_account_summary: 60_000,
  list_bundles: 120_000,
};

interface CacheEntry {
  response: AgentResponse;
  expiresAt: number;
}

export class BffResponseCacheAdapter implements OnModuleDestroy {
  private readonly store = new Map<string, CacheEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => this.removeExpiredEntries(), 60_000);
    if (typeof this.cleanupTimer.unref === "function") {
      this.cleanupTimer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  get(userId: string, toolName: string): AgentResponse | null {
    const entry = this.store.get(this.key(userId, toolName));
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(this.key(userId, toolName));
      return null;
    }

    return structuredClone(entry.response);
  }

  set(
    userId: string,
    toolName: string,
    response: AgentResponse,
  ): void {
    const ttl = TOOL_CACHE_TTL_MS[toolName];
    if (ttl == null) return;

    this.store.set(this.key(userId, toolName), {
      response: structuredClone(response),
      expiresAt: Date.now() + ttl,
    });
  }

  invalidate(userId: string, toolName: string): void {
    this.store.delete(this.key(userId, toolName));
  }

  invalidateAllForUser(userId: string): void {
    const prefix = `${userId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  private key(userId: string, toolName: string): string {
    return `${userId}:${toolName}`;
  }

  private removeExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}