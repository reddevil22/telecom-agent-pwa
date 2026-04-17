import type { OnModuleDestroy } from "@nestjs/common";
import type { AgentResponse, ScreenType } from "../../domain/types/agent";
import type { ScreenCachePort } from "../../domain/ports/screen-cache.port";

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 500;
const CLEANUP_INTERVAL_MS = 120_000;

interface CacheEntry {
  response: AgentResponse;
  createdAt: number;
}

export class InMemoryScreenCacheAdapter
  implements ScreenCachePort, OnModuleDestroy
{
  private readonly store = new Map<string, CacheEntry>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(
      () => this.removeExpiredEntries(),
      CLEANUP_INTERVAL_MS,
    );
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

  get(userId: string, screenType: ScreenType): AgentResponse | null {
    const entry = this.store.get(this.key(userId, screenType));
    if (!entry) return null;

    if (Date.now() - entry.createdAt > TTL_MS) {
      this.store.delete(this.key(userId, screenType));
      return null;
    }

    return structuredClone(entry.response);
  }

  set(userId: string, screenType: ScreenType, response: AgentResponse): void {
    this.removeExpiredEntries();

    this.store.set(this.key(userId, screenType), {
      response: structuredClone(response),
      createdAt: Date.now(),
    });

    this.evictOldestEntries();
  }

  invalidate(userId: string, screenType: ScreenType): void {
    this.store.delete(this.key(userId, screenType));
  }

  invalidateAll(userId: string): void {
    const prefix = `${userId}:`;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  private key(userId: string, screenType: ScreenType): string {
    return `${userId}:${screenType}`;
  }

  private removeExpiredEntries(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.createdAt > TTL_MS) {
        this.store.delete(key);
      }
    }
  }

  private evictOldestEntries(): void {
    if (this.store.size <= MAX_ENTRIES) return;

    const entries = Array.from(this.store.entries()).sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    );

    const overflow = this.store.size - MAX_ENTRIES;
    for (let i = 0; i < overflow; i++) {
      this.store.delete(entries[i][0]);
    }
  }
}
