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
  };

  constructor(
    private readonly cache: ScreenCachePort | null,
    private readonly metrics: MetricsPort | null,
    private readonly logger: PinoLogger | null,
    private readonly intentKeywords: IntentKeywordMap,
  ) {}

  tryHit(request: AgentRequest): AgentResponse | null {
    if (!this.cache) {
      return null;
    }

    // Quick keyword check to determine which screen type to look up.
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

    if (ScreenCacheManager.CACHEABLE_SCREENS.has(response.screenType)) {
      this.cache.set(request.userId, response.screenType, response);
    }
  }
}
