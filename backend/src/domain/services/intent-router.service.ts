import type { IntentRouterPort } from '../ports/intent-router.port';
import type { IntentResolution } from '../types/intent';
import { TelecomIntent, TIER1_INTENTS, INTENT_TOOL_MAP, INTENT_KEYWORDS } from '../types/intent';
import type { IntentCacheService } from '../../application/supervisor/intent-cache.service';

/**
 * Three-tier intent classification:
 *   Tier 1 — exact keyword match (no LLM needed)
 *   Tier 2 — fuzzy intent cache (no LLM needed)
 *   Tier 3 — returns null (caller falls through to LLM)
 */
export class IntentRouterService implements IntentRouterPort {
  constructor(private readonly cache: IntentCacheService) {}

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
    if (TIER1_INTENTS.has(intent)) {
      this.cache.store(userId, prompt, intent);
    }
  }

  /** Words that signal a purchase/action intent requiring entity extraction */
  private static readonly ACTION_SIGNALS = ['buy', 'purchase', 'order', 'subscribe', 'activate', 'get me', 'i want', 'i need'];

  private tier1KeywordMatch(prompt: string, userId: string): IntentResolution | null {
    const lower = prompt.toLowerCase();
    const matches: TelecomIntent[] = [];

    const hasActionSignal = IntentRouterService.ACTION_SIGNALS.some(signal => lower.includes(signal));

    for (const [intentKey, keywords] of Object.entries(INTENT_KEYWORDS)) {
      const intent = intentKey as TelecomIntent;
      // If the prompt has a purchase/action signal, skip BROWSE_BUNDLES —
      // "buy travel roaming bundle" should go to LLM for entity extraction, not list_bundles
      if (hasActionSignal && intent === TelecomIntent.BROWSE_BUNDLES) continue;
      if (keywords.some(kw => lower.includes(kw))) {
        matches.push(intent);
      }
    }

    // Only return when there's exactly one unambiguous match
    if (matches.length !== 1) return null;

    const intent = matches[0];
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
