import type { IntentRouterPort } from '../ports/intent-router.port';
import type { IntentCachePort } from '../ports/intent-cache.port';
import type { IntentResolution } from '../types/intent';
import { TelecomIntent, TIER1_INTENTS, INTENT_TOOL_MAP, INTENT_KEYWORDS, type IntentKeywordMap, type Tier1Intent } from '../types/intent';

/**
 * Three-tier intent classification:
 *   Tier 1 — exact keyword match (no LLM needed)
 *   Tier 2 — fuzzy intent cache (no LLM needed)
 *   Tier 3 — returns null (caller falls through to LLM)
 */
export class IntentRouterService implements IntentRouterPort {
  constructor(
    private readonly cache: IntentCachePort,
    private readonly intentKeywords: IntentKeywordMap = INTENT_KEYWORDS,
    private readonly actionSignals: readonly string[] = IntentRouterService.DEFAULT_ACTION_SIGNALS,
  ) {}

  async classify(prompt: string, userId: string): Promise<IntentResolution | null> {
    // Tier 1: Exact keyword match
    const tier1 = this.tier1KeywordMatch(prompt, userId);
    if (tier1) return tier1;

    // Tier 2: Fuzzy intent cache
    const tier2 = this.tier2FuzzyCache(prompt, userId);
    if (tier2) return tier2;

    // Tier 3: Caller falls through to LLM
    return null;
  }

  /**
   * Store a successful LLM classification into the fuzzy cache.
   * Only Tier 1-eligible intents are cached (no entity-extraction intents).
   */
  cacheLlmResult(userId: string, prompt: string, intent: TelecomIntent): void {
    if (TIER1_INTENTS.has(intent as Tier1Intent)) {
      this.cache.store(userId, prompt, intent);
    }
  }

  /** Words that signal a purchase/action intent requiring entity extraction */
  private static readonly DEFAULT_ACTION_SIGNALS = ['buy', 'purchase', 'order', 'subscribe', 'activate', 'get me', 'i want', 'i need'];

  /** Deterministic tie-breaker when lexical specificity is equal */
  private static readonly INTENT_MATCH_PRIORITY: Readonly<Record<TelecomIntent, number>> = {
    [TelecomIntent.CHECK_BALANCE]: 100,
    [TelecomIntent.CHECK_USAGE]: 95,
    [TelecomIntent.BROWSE_BUNDLES]: 90,
    [TelecomIntent.GET_SUPPORT]: 85,
    [TelecomIntent.ACCOUNT_SUMMARY]: 80,
    [TelecomIntent.VIEW_BUNDLE]: 70,
    [TelecomIntent.PURCHASE_BUNDLE]: 65,
    [TelecomIntent.TOP_UP]: 60,
    [TelecomIntent.CREATE_TICKET]: 55,
  };

  private tier1KeywordMatch(prompt: string, userId: string): IntentResolution | null {
    const lower = prompt.toLowerCase();
    const matches: Array<{ intent: TelecomIntent; score: number; keywordCount: number }> = [];

    const hasActionSignal = this.actionSignals.some(signal => lower.includes(signal));

    for (const [intentKey, keywords] of Object.entries(this.intentKeywords)) {
      const intent = intentKey as TelecomIntent;
      // If the prompt has a purchase/action signal, skip BROWSE_BUNDLES —
      // "buy travel roaming bundle" should go to LLM for entity extraction, not list_bundles
      if (hasActionSignal && intent === TelecomIntent.BROWSE_BUNDLES) continue;

      const matchedKeywords = keywords.filter((kw) => lower.includes(kw));
      if (matchedKeywords.length === 0) continue;

      // Prefer lexically specific matches (multi-word and longer phrases).
      const score = Math.max(
        ...matchedKeywords.map((keyword) => {
          const words = keyword.trim().split(/\s+/).filter(Boolean).length;
          return words * 100 + keyword.length;
        }),
      );

      matches.push({ intent, score, keywordCount: matchedKeywords.length });
    }

    if (matches.length === 0) return null;

    matches.sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;

      const keywordCountDiff = b.keywordCount - a.keywordCount;
      if (keywordCountDiff !== 0) return keywordCountDiff;

      return IntentRouterService.INTENT_MATCH_PRIORITY[b.intent] - IntentRouterService.INTENT_MATCH_PRIORITY[a.intent];
    });

    const intent = matches[0].intent;
    return {
      intent,
      toolName: INTENT_TOOL_MAP[intent],
      args: { userId },
      confidence: 1.0,
    };
  }

  private tier2FuzzyCache(prompt: string, userId: string): IntentResolution | null {
    const cached = this.cache.findBestMatch(userId, prompt);
    if (!cached) return null;

    return {
      intent: cached.intent,
      toolName: INTENT_TOOL_MAP[cached.intent],
      args: { userId },
      confidence: cached.confidence,
    };
  }
}
