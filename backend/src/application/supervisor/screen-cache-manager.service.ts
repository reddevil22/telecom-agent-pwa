import type { PinoLogger } from "nestjs-pino";
import type {
  AgentRequest,
  AgentResponse,
  ScreenType,
} from "../../domain/types/agent";
import {
  INTENT_TOOL_MAP,
  TelecomIntent,
  type IntentKeywordMap,
} from "../../domain/types/intent";
import { TOOL_TO_SCREEN } from "../../domain/constants/agent-constants";
import type { ScreenCachePort } from "../../domain/ports/screen-cache.port";
import type { MetricsPort } from "../../domain/ports/metrics.port";

export class ScreenCacheManager {
  private static readonly CACHEABLE_SCREENS = new Set<ScreenType>([
    "balance",
    "bundles",
    "usage",
    "support",
    "account",
  ]);

  private static readonly CONFIRMATION_CACHE_INVALIDATION: Record<
    string,
    ScreenType[]
  > = {
    purchase_bundle: ["balance", "bundles"],
    top_up: ["balance"],
    create_ticket: ["support"],
    share_data: ["usage"],
  };

  /**
   * @param cache         Cache port for storing/retrieving screen responses
   * @param metrics       Metrics port for recording cache hit/miss
   * @param logger        Structured logger
   * @param intentKeywords The **same** keyword map used by IntentRouterService,
   *                       typically loaded from intent-keywords.json at startup.
   *                       This shared map ensures that the cache manager's
   *                       keyword matching is always in sync with the router.
   */
  constructor(
    private readonly cache: ScreenCachePort | null,
    private readonly metrics: MetricsPort | null,
    private readonly logger: PinoLogger | null,
    private readonly intentKeywords: IntentKeywordMap,
  ) {}

  /**
   * Attempt to serve a previously-cached screen response for the given
   * request prompt.
   *
   * ## Relationship to the Intent Router
   *
   * This method runs **after** {@link IntentRouterService.classify} has already
   * returned null (i.e. Tier 3 — the prompt needs the LLM). At that point the
   * screen cache acts as a lightweight fallback:
   *
   * > "Is this prompt about the *same screen type* we served last time?"
   *
   * It re-uses `intentKeywords` — **the very same keyword map** that the intent
   * router uses — so the two subsystems always agree on which keywords map to
   * which screen types. Keyword changes in `intent-keywords.json` propagate to
   * both automatically because the map is loaded once at startup and injected
   * into both services.
   *
   * ## Keyword Matching Strategy
   *
   * Compared to the intent router's full pipeline (action-signal bypass,
   * top-up/create-ticket signal bypass, multi-keyword scoring, intent-match
   * priority), this method uses a deliberately simpler check:
   *
   * 1. Does **any** keyword for a Tier-1 intent appear in the prompt?
   * 2. If exactly **one** screen type matches → try the cache for that type.
   * 3. If zero or multiple screen types match → bail out (too ambiguous).
   *
   * The `matches.length !== 1` guard is the key conservative gate: ambiguous
   * prompts (e.g. "buy Value Plus bundle" which hits both "bundles" and "buy"
   * keywords) are never served from cache, avoiding false positives. The
   * intent router's action-signal bypass would have already handled such
   * prompts correctly.
   */
  tryHit(request: AgentRequest): AgentResponse | null {
    if (!this.cache) {
      return null;
    }

    // Quick keyword check — uses the same intentKeywords map as the
    // IntentRouterService to determine which screen type the prompt targets.
    const lower = request.prompt.toLowerCase();
    const matches: ScreenType[] = [];
    for (const [intentKey, keywords] of Object.entries(this.intentKeywords)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        const toolName = INTENT_TOOL_MAP[intentKey as TelecomIntent];
        const screenType = TOOL_TO_SCREEN[toolName] as ScreenType;
        if (screenType) {
          matches.push(screenType);
        }
      }
    }

    // Guard: only serve from cache when exactly ONE screen type matches.
    // Zero matches → no cache candidate. Multiple matches → ambiguous prompt
    // (the intent router would normally handle these with its scoring logic,
    //  but if we got here it means the router already returned null).
    if (matches.length !== 1) {
      this.metrics?.recordCacheHit("screen", false);
      return null;
    }

    const cached = this.cache.get(request.userId, matches[0]);
    if (cached) {
      this.metrics?.recordCacheHit("screen", true);
      this.logger?.info({ screenType: matches[0] }, "Screen cache hit");
      return {
        ...cached,
        processingSteps: [{ label: "Retrieved from cache", status: "done" }],
      };
    }

    this.metrics?.recordCacheHit("screen", false);
    return null;
  }

  store(
    request: AgentRequest,
    response: AgentResponse,
    toolName?: string,
  ): void {
    if (!this.cache) {
      return;
    }

    if (response.screenType === "confirmation") {
      const isPendingConfirmation =
        response.screenData.type === "confirmation" &&
        response.screenData.status === "pending";

      if (isPendingConfirmation) {
        return;
      }

      if (!toolName) {
        this.cache.invalidateAll(request.userId);
        return;
      }

      const impactedScreens =
        ScreenCacheManager.CONFIRMATION_CACHE_INVALIDATION[toolName] ?? [];
      for (const screenType of impactedScreens) {
        this.cache.invalidate(request.userId, screenType);
      }
      return;
    }

    // Invalidate affected screen caches for mutating actions even when the
    // response is not a confirmation screen (e.g. share_data → dataGift screen
    // still needs to invalidate the cached usage screen).
    if (toolName) {
      const impactedScreens =
        ScreenCacheManager.CONFIRMATION_CACHE_INVALIDATION[toolName] ?? [];
      for (const screenType of impactedScreens) {
        this.cache.invalidate(request.userId, screenType);
      }
    }

    if (ScreenCacheManager.CACHEABLE_SCREENS.has(response.screenType)) {
      this.cache.set(request.userId, response.screenType, response);
    }
  }
}
