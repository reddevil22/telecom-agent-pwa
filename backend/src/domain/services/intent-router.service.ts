import type { IntentRouterPort } from "../ports/intent-router.port";
import type { IntentResolution } from "../types/intent";
import {
  TelecomIntent,
  INTENT_TOOL_MAP,
  INTENT_KEYWORDS,
  type IntentKeywordMap,
} from "../types/intent";

/**
 * Two-tier intent classification:
 *   Tier 1 — exact keyword match (no LLM needed)
 *   Tier 2 — LLM fallback (caller handles)
 *
 * Deterministic handlers (data-gift, top-up, purchase) run before Tier 1
 * and bypass LLM when they have complete entity information.
 */
export class IntentRouterService implements IntentRouterPort {
  constructor(
    private readonly intentKeywords: IntentKeywordMap = INTENT_KEYWORDS,
    private readonly actionSignals: readonly string[] = IntentRouterService.DEFAULT_ACTION_SIGNALS,
  ) {}

  async classify(
    prompt: string,
    userId: string,
  ): Promise<IntentResolution | null> {
    // Deterministic data-gift routing when the prompt includes recipient + amount.
    const shareData = this.shareDataIntentMatch(prompt, userId);
    if (shareData) return shareData;

    // Deterministic top-up routing when the prompt includes an amount.
    const topUp = this.topUpIntentMatch(prompt, userId);
    if (topUp) return topUp;

    // Deterministic purchase routing when the prompt includes a concrete bundle ID.
    const purchase = this.purchaseIntentMatch(prompt, userId);
    if (purchase) return purchase;

    // Tier 1: Exact keyword match — returns null if no match (caller falls through to LLM)
    const tier1 = this.tier1KeywordMatch(prompt, userId);
    if (tier1) return tier1;

    // Tier 2: No match — caller handles via LLM
    return null;
  }

  /** Words that signal a purchase/action intent requiring entity extraction */
  private static readonly DEFAULT_ACTION_SIGNALS = [
    "buy",
    "purchase",
    "order",
    "subscribe",
    "activate",
    "get me",
    "i want",
    "i need",
  ];

  /** Verbs that indicate an explicit purchase confirmation intent */
  private static readonly PURCHASE_SIGNALS = [
    "buy",
    "purchase",
    "order",
    "subscribe",
    "activate",
    "confirm",
  ];

  /** Phrases that indicate top-up intents and should bypass Tier 1 account/balance keyword routing */
  private static readonly TOP_UP_SIGNALS = [
    "top up",
    "topup",
    "recharge",
    "add credit",
    "add money",
  ];

  /** Phrases that indicate data-gift intents */
  private static readonly SHARE_DATA_SIGNALS = [
    "share data",
    "gift data",
    "send data",
    "transfer data",
  ];

  /** Phrases that indicate ticket creation intents and should bypass Tier 1 get_support keyword routing */
  private static readonly CREATE_TICKET_SIGNALS = [
    "create a ticket",
    "create ticket",
    "new ticket",
    "submit ticket",
    "report an issue",
    "report a problem",
    "file a complaint",
    "open a ticket",
  ];

  /** Deterministic tie-breaker when lexical specificity is equal */
  private static readonly INTENT_MATCH_PRIORITY: Readonly<
    Record<TelecomIntent, number>
  > = {
    [TelecomIntent.CHECK_BALANCE]: 100,
    [TelecomIntent.CHECK_USAGE]: 95,
    [TelecomIntent.BROWSE_BUNDLES]: 90,
    [TelecomIntent.GET_SUPPORT]: 85,
    [TelecomIntent.ACCOUNT_SUMMARY]: 80,
    [TelecomIntent.VIEW_BUNDLE]: 70,
    [TelecomIntent.PURCHASE_BUNDLE]: 65,
    [TelecomIntent.TOP_UP]: 60,
    [TelecomIntent.CREATE_TICKET]: 55,
    [TelecomIntent.SHARE_DATA]: 50,
  };

  private tier1KeywordMatch(
    prompt: string,
    userId: string,
  ): IntentResolution | null {
    const lower = prompt.toLowerCase();
    const matches: Array<{
      intent: TelecomIntent;
      score: number;
      keywordCount: number;
    }> = [];

    const hasActionSignal = this.actionSignals.some((signal) =>
      lower.includes(signal),
    );
    const hasTopUpSignal = this.hasTopUpSignal(prompt);
    const hasCreateTicketSignal = this.hasCreateTicketSignal(prompt);

    for (const [intentKey, keywords] of Object.entries(this.intentKeywords)) {
      const intent = intentKey as TelecomIntent;
      // If the prompt has a purchase/action signal, skip BROWSE_BUNDLES —
      // "buy travel roaming bundle" should go to LLM for entity extraction, not list_bundles
      if (hasActionSignal && intent === TelecomIntent.BROWSE_BUNDLES) continue;
      // Top-up prompts can contain words like "account" or "credit" that belong to Tier 1 intents.
      // Bypass these Tier 1 matches and let LLM extract amount for top_up.
      if (
        hasTopUpSignal &&
        (intent === TelecomIntent.CHECK_BALANCE ||
          intent === TelecomIntent.ACCOUNT_SUMMARY)
      )
        continue;
      // Ticket creation prompts contain words like "ticket" and "support" that belong to
      // the get_support keyword list. Bypass Tier 1 and let LLM create the ticket.
      if (hasCreateTicketSignal && intent === TelecomIntent.GET_SUPPORT) continue;

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

      return (
        IntentRouterService.INTENT_MATCH_PRIORITY[b.intent] -
        IntentRouterService.INTENT_MATCH_PRIORITY[a.intent]
      );
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
    return IntentRouterService.TOP_UP_SIGNALS.some((signal) =>
      lower.includes(signal),
    );
  }

  private hasCreateTicketSignal(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    return IntentRouterService.CREATE_TICKET_SIGNALS.some((signal) =>
      lower.includes(signal),
    );
  }

  private topUpIntentMatch(
    prompt: string,
    userId: string,
  ): IntentResolution | null {
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

  private purchaseIntentMatch(
    prompt: string,
    userId: string,
  ): IntentResolution | null {
    const lower = prompt.toLowerCase();
    const hasPurchaseSignal = IntentRouterService.PURCHASE_SIGNALS.some(
      (signal) => lower.includes(signal),
    );
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
    const signalMatch = prompt.match(
      /(?:top\s*up|recharge|add\s+(?:credit|money))\b/i,
    );
    if (!signalMatch) return null;

    const afterSignal = prompt.slice(
      signalMatch.index! + signalMatch[0].length,
    );
    const numbers = [...afterSignal.matchAll(/\b(\d+(?:\.\d+)?)\b/g)];
    return numbers.length > 0 ? numbers[numbers.length - 1][1] : null;
  }

  private extractBundleId(prompt: string): string | null {
    const explicitBundleRef = prompt.match(
      /\bbundle\s*(?:id(?:\s*is)?\s*)?(b\d+)\b/i,
    );
    if (explicitBundleRef?.[1]) return explicitBundleRef[1].toLowerCase();

    const standaloneBundleId = prompt.match(/\b(b\d+)\b/i);
    return standaloneBundleId?.[1]?.toLowerCase() ?? null;
  }

  private hasShareDataSignal(prompt: string): boolean {
    const lower = prompt.toLowerCase();
    return IntentRouterService.SHARE_DATA_SIGNALS.some((signal) =>
      lower.includes(signal),
    );
  }

  private shareDataIntentMatch(
    prompt: string,
    userId: string,
  ): IntentResolution | null {
    if (!this.hasShareDataSignal(prompt)) return null;

    const amount = this.extractDataAmount(prompt);
    if (!amount) return null;

    const recipientQuery = this.extractRecipientQuery(prompt);
    if (!recipientQuery) return null;

    return {
      intent: TelecomIntent.SHARE_DATA,
      toolName: INTENT_TOOL_MAP[TelecomIntent.SHARE_DATA],
      args: { userId, recipientQuery, amount },
      confidence: 1.0,
    };
  }

  private extractDataAmount(prompt: string): string | null {
    const match = prompt.match(/\b(\d+(?:\.\d+)?)\s*(GB|MB|gb|mb)\b/);
    return match ? `${match[1]} ${match[2].toUpperCase()}` : null;
  }

  private extractRecipientQuery(prompt: string): string | null {
    // Look for "with X", "to X", "for X" after the amount
    const match = prompt.match(/(?:with|to|for)\s+([A-Za-z][A-Za-z0-9\s+]*?)(?:\s*$|\s+(?:from|using|via)\b)/i);
    if (match?.[1]) return match[1].trim();

    // Fallback: last capitalized word or phone number
    const words = prompt.split(/\s+/);
    for (let i = words.length - 1; i >= 0; i--) {
      const w = words[i].replace(/[^A-Za-z0-9+]/g, "");
      if (/^[A-Za-z]/.test(w) || /^\+?\d{3,}$/.test(w)) {
        return w;
      }
    }
    return null;
  }
}
