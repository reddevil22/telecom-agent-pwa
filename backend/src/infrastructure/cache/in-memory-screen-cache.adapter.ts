import type { AgentResponse, ScreenType } from '../../domain/types/agent';
import type { ScreenCachePort } from '../../domain/ports/screen-cache.port';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  response: AgentResponse;
  createdAt: number;
}

export class InMemoryScreenCacheAdapter implements ScreenCachePort {
  private readonly store = new Map<string, CacheEntry>();

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
    this.store.set(this.key(userId, screenType), {
      response: structuredClone(response),
      createdAt: Date.now(),
    });
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
}
