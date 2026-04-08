import type { TelecomIntent } from '../../domain/types/intent';

export interface FuzzyCacheResult {
  intent: TelecomIntent;
  confidence: number;
}

export class IntentCacheService {
  private readonly entries = new Map<string, Array<{
    tokenSet: Set<string>;
    intent: TelecomIntent;
    createdAt: number;
    lastMatchedAt: number;
  }>>();

  private static readonly MAX_ENTRIES_PER_USER = 50;
  private static readonly TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly SIMILARITY_THRESHOLD = 0.6;

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
  }

  findBestMatch(userId: string, prompt: string): FuzzyCacheResult | null {
    const tokenSet = this.tokenize(prompt);
    if (tokenSet.size === 0) return null;

    const entries = this.entries.get(userId);
    if (!entries || entries.length === 0) return null;

    const now = Date.now();
    let bestEntry: typeof entries[0] | null = null;
    let bestScore = 0;

    for (const entry of entries) {
      // Skip expired
      if (now - entry.createdAt >= IntentCacheService.TTL_MS) continue;

      const score = this.jaccardSimilarity(tokenSet, entry.tokenSet);
      if (score > bestScore && score >= IntentCacheService.SIMILARITY_THRESHOLD) {
        bestScore = score;
        bestEntry = entry;
      }
    }

    if (!bestEntry) return null;

    // Update last matched time
    bestEntry.lastMatchedAt = now;

    return {
      intent: bestEntry.intent,
      confidence: Math.min(bestScore, 0.99),
    };
  }

  invalidateAll(userId: string): void {
    this.entries.delete(userId);
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
