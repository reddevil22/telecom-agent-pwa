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
    // Deterministic top-up routing when the prompt includes an amount.
    const topUp = this.topUpIntentMatch(prompt, userId);
    if (topUp) return topUp;

    // Deterministic purchase routing when the prompt includes a concrete bundle ID.
    const purchase = this.purchaseIntentMatch(prompt, userId);
    if (purchase) return purchase;

    // Tier 1: Exact keyword match
    const tier1 = this.tier1KeywordMatch(prompt, userId);
    if (tier1) return tier1;

    // Top-up prompts often contain "account" or "credit" and must bypass Tier 2 cache
    // to avoid stale account/balance intent matches.
    if (this.hasTopUpSignal(prompt)) return null;

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

  /** Verbs that indicate an explicit purchase confirmation intent */
  private static readonly PURCHASE_SIGNALS = ['buy', 'purchase', 'order', 'subscribe', 'activate', 'confirm'];

  /** Phrases that indicate top-up intents and should bypass Tier 1 account/balance keyword routing */
  private static readonly TOP_UP_SIGNALS = ['top up', 'topup', 'recharge', 'add credit', 'add money'];

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
    const hasTopUpSignal = this.hasTopUpSignal(prompt);

    for (const [intentKey, keywords] of Object.entries(this.intentKeywords)) {
      const intent = intentKey as TelecomIntent;
      // If the prompt has a purchase/action signal, skip BROWSE_BUNDLES —
      // "buy travel roaming bundle" should go to LLM for entity extraction, not list_bundles
      if (hasActionSignal && intent === TelecomIntent.BROWSE_BUNDLES) continue;
      // Top-up prompts can contain words like "account" or "credit" that belong to Tier 1 intents.
      // Bypass these Tier 1 matches and let LLM extract amount for top_up.
      if (hasTopUpSignal && (intent === TelecomIntent.CHECK_BALANCE || intent === TelecomIntent.ACCOUNT_SUMMARY)) continue;

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

  private hasTopUpSignal(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    return IntentRouterService.TOP_UP_SIGNALS.some(signal => lower.includes(signal));
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

  private topUpIntentMatch(prompt: string, userId: string): IntentResolution | null {
    if (!this.hasTopUpSignal(prompt)) return null;

    const amount = this.extractAmount(prompt);
    if (!amount) return null;

    return {
      intent: TelecomIntent.TOP_UP,
      toolName: INTENT_TOOL_MAP[TelecomIntent.TOP_UP],
      args: { userId, amount },
      confidence: 1.0,
    };
  }

  private purchaseIntentMatch(prompt: string, userId: string): IntentResolution | null {
    const lower = prompt.toLowerCase();
    const hasPurchaseSignal = IntentRouterService.PURCHASE_SIGNALS.some(signal => lower.includes(signal));
    if (!hasPurchaseSignal) return null;

    const bundleId = this.extractBundleId(lower);
    if (!bundleId) return null;

    return {
      intent: TelecomIntent.PURCHASE_BUNDLE,
      toolName: INTENT_TOOL_MAP[TelecomIntent.PURCHASE_BUNDLE],
      args: { userId, bundleId },
      confidence: 1.0,
    };
  }

  private extractAmount(prompt: string): string | null {
    const match = prompt.match(/\b(\d+(?:\.\d+)?)\b/);
    return match?.[1] ?? null;
  }

  private extractBundleId(prompt: string): string | null {
    const explicitBundleRef = prompt.match(/\bbundle\s*(?:id(?:\s*is)?\s*)?(b\d+)\b/i);
    if (explicitBundleRef?.[1]) return explicitBundleRef[1].toLowerCase();

    const standaloneBundleId = prompt.match(/\b(b\d+)\b/i);
    return standaloneBundleId?.[1]?.toLowerCase() ?? null;
  }
}
