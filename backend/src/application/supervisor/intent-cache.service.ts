import type { OnModuleDestroy } from '@nestjs/common';
import type { IntentCacheMatch, IntentCachePort } from '../../domain/ports/intent-cache.port';
import type { TelecomIntent } from '../../domain/types/intent';

interface IntentCacheEntry {
  tokenSet: Set<string>;
  intent: TelecomIntent;
  createdAt: number;
  lastMatchedAt: number;
}

export interface FuzzyCacheResult extends IntentCacheMatch {}

export class IntentCacheService implements IntentCachePort, OnModuleDestroy {
  private readonly entries = new Map<string, IntentCacheEntry[]>();
  private readonly userLastSeen = new Map<string, number>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private static readonly MAX_ENTRIES_PER_USER = 50;
  private static readonly MAX_USERS = 1000;
  private static readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly CLEANUP_INTERVAL_MS = 120_000;
  private static readonly DEFAULT_SIMILARITY_THRESHOLD = 0.6;
  private static readonly MIN_TOKENS_FOR_MATCH = 2;

  private readonly similarityThreshold: number;

  private static readonly STOP_WORDS = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
    'either', 'neither', 'each', 'every', 'all', 'any', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
    'too', 'very', 'just', 'because', 'if', 'when', 'where', 'how',
    'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
    'i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'you', 'your',
    'yours', 'he', 'him', 'his', 'she', 'her', 'hers', 'it', 'its',
  ]);

  constructor(similarityThreshold = IntentCacheService.DEFAULT_SIMILARITY_THRESHOLD) {
    const parsed = Number.isFinite(similarityThreshold)
      ? similarityThreshold
      : IntentCacheService.DEFAULT_SIMILARITY_THRESHOLD;
    this.similarityThreshold = Math.max(0, Math.min(1, parsed));

    this.cleanupTimer = setInterval(
      () => this.cleanupExpiredEntries(),
      IntentCacheService.CLEANUP_INTERVAL_MS,
    );
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(token => token.length > 0 && !IntentCacheService.STOP_WORDS.has(token)),
    );
  }

  store(userId: string, prompt: string, intent: TelecomIntent): void {
    const tokenSet = this.tokenize(prompt);
    if (tokenSet.size === 0) return;

    const key = userId;
    let entries = this.entries.get(key);
    if (!entries) {
      entries = [];
      this.entries.set(key, entries);
    }

    const now = Date.now();

    // Remove expired entries
    entries = entries.filter(e => now - e.createdAt < IntentCacheService.TTL_MS);

    // Check for duplicate intent with similar tokens — update instead of adding
    const existingIdx = entries.findIndex(e => e.intent === intent);
    if (existingIdx >= 0) {
      entries[existingIdx].tokenSet = tokenSet;
      entries[existingIdx].lastMatchedAt = now;
    } else {
      entries.push({ tokenSet, intent, createdAt: now, lastMatchedAt: now });
    }

    // LRU eviction: remove oldest entries if over limit
    if (entries.length > IntentCacheService.MAX_ENTRIES_PER_USER) {
      entries.sort((a, b) => a.lastMatchedAt - b.lastMatchedAt);
      entries.splice(0, entries.length - IntentCacheService.MAX_ENTRIES_PER_USER);
    }

    this.entries.set(key, entries);
    this.userLastSeen.set(key, now);
    this.evictLeastRecentlyUsedUsers();
  }

  findBestMatch(userId: string, prompt: string): FuzzyCacheResult | null {
    const tokenSet = this.tokenize(prompt);
    if (tokenSet.size < IntentCacheService.MIN_TOKENS_FOR_MATCH) return null;

    const entries = this.entries.get(userId);
    if (!entries || entries.length === 0) return null;

    const now = Date.now();
    let hasExpiredEntries = false;
    let bestEntry: typeof entries[0] | null = null;
    let bestScore = 0;

    for (const entry of entries) {
      // Skip expired
      if (now - entry.createdAt >= IntentCacheService.TTL_MS) {
        hasExpiredEntries = true;
        continue;
      }

      const score = this.jaccardSimilarity(tokenSet, entry.tokenSet);
      if (score > bestScore && score >= this.similarityThreshold) {
        bestScore = score;
        bestEntry = entry;
      }
    }

    if (hasExpiredEntries) {
      this.pruneExpiredEntriesForUser(userId, now);
    }

    if (!bestEntry) return null;

    // Update last matched time
    bestEntry.lastMatchedAt = now;
    this.userLastSeen.set(userId, now);

    return {
      intent: bestEntry.intent,
      confidence: Math.min(bestScore, 0.99),
    };
  }

  invalidateAll(userId: string): void {
    this.entries.delete(userId);
    this.userLastSeen.delete(userId);
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const userId of this.entries.keys()) {
      this.pruneExpiredEntriesForUser(userId, now);
    }
    this.evictLeastRecentlyUsedUsers();
  }

  private pruneExpiredEntriesForUser(userId: string, now: number): void {
    const entries = this.entries.get(userId);
    if (!entries) return;

    const alive = entries.filter((entry) => now - entry.createdAt < IntentCacheService.TTL_MS);
    if (alive.length === 0) {
      this.entries.delete(userId);
      this.userLastSeen.delete(userId);
      return;
    }

    this.entries.set(userId, alive);
  }

  private evictLeastRecentlyUsedUsers(): void {
    while (this.entries.size > IntentCacheService.MAX_USERS) {
      let oldestUserId: string | null = null;
      let oldestSeen = Number.POSITIVE_INFINITY;

      for (const [userId, seenAt] of this.userLastSeen) {
        if (seenAt < oldestSeen) {
          oldestSeen = seenAt;
          oldestUserId = userId;
        }
      }

      if (!oldestUserId) {
        oldestUserId = this.entries.keys().next().value as string | undefined ?? null;
      }
      if (!oldestUserId) break;

      this.entries.delete(oldestUserId);
      this.userLastSeen.delete(oldestUserId);
    }
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;

    let intersection = 0;
    for (const token of a) {
      if (b.has(token)) intersection++;
    }

    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
