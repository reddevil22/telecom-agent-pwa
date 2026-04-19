import type { PinoLogger } from "nestjs-pino";
import type { MetricsPort } from "../../domain/ports/metrics.port";
import {
  TelecomIntent,
  type IntentKeywordMap,
} from "../../domain/types/intent";
import type { AgentRequest, AgentResponse } from "../../domain/types/agent";
import { InMemoryScreenCacheAdapter } from "../../infrastructure/cache/in-memory-screen-cache.adapter";
import { ScreenCacheManager } from "./screen-cache-manager.service";

function makeRequest(prompt: string): AgentRequest {
  return {
    prompt,
    userId: "user-1",
    sessionId: "s1",
    conversationHistory: [],
    timestamp: Date.now(),
  };
}

function makeBalanceResponse(): AgentResponse {
  return {
    screenType: "balance",
    screenData: {
      type: "balance",
      balance: {
        current: 100,
        currency: "USD",
        lastTopUp: "2026-04-01",
        nextBillingDate: "2026-05-01",
      },
    },
    replyText: "Here is your current account balance.",
    suggestions: ["Check my usage"],
    confidence: 0.95,
    processingSteps: [{ label: "Done", status: "done" }],
  };
}

describe("ScreenCacheManager", () => {
  const intentKeywords: IntentKeywordMap = {
    [TelecomIntent.CHECK_BALANCE]: ["balance"],
    [TelecomIntent.CHECK_USAGE]: ["usage"],
    [TelecomIntent.BROWSE_BUNDLES]: ["bundles"],
    [TelecomIntent.GET_SUPPORT]: ["support"],
    [TelecomIntent.ACCOUNT_SUMMARY]: ["account"],
  };

  let metrics: jest.Mocked<MetricsPort>;
  let logger: Pick<PinoLogger, "info">;

  beforeEach(() => {
    metrics = {
      recordIntentResolution: jest.fn(),
      recordCacheHit: jest.fn(),
      recordLlmCall: jest.fn(),
      recordToolCall: jest.fn(),
      recordToolFailure: jest.fn(),
      recordToolTemporarilyDisabled: jest.fn(),
      recordToolBlocked: jest.fn(),
      recordToolRecovered: jest.fn(),
      recordCircuitBreakerTransition: jest.fn(),
      getSnapshot: jest.fn(),
    } as unknown as jest.Mocked<MetricsPort>;

    logger = {
      info: jest.fn(),
    };
  });

  it("returns cached response when one cache-mappable intent is detected", () => {
    const cache = new InMemoryScreenCacheAdapter();
    const manager = new ScreenCacheManager(
      cache,
      metrics,
      logger as unknown as PinoLogger,
      intentKeywords,
    );

    cache.set("user-1", "balance", makeBalanceResponse());

    const result = manager.tryHit(makeRequest("show my balance"));

    expect(result?.screenType).toBe("balance");
    expect(result?.processingSteps[0].label).toBe("Retrieved from cache");
    expect(metrics.recordCacheHit).toHaveBeenCalledWith("screen", true);
  });

  it("returns null on ambiguous prompts and records miss", () => {
    const manager = new ScreenCacheManager(
      new InMemoryScreenCacheAdapter(),
      metrics,
      logger as unknown as PinoLogger,
      intentKeywords,
    );

    const result = manager.tryHit(makeRequest("show my balance and usage"));

    expect(result).toBeNull();
    expect(metrics.recordCacheHit).toHaveBeenCalledWith("screen", false);
  });

  it("invalidates impacted caches when storing confirmation response", () => {
    const cache = new InMemoryScreenCacheAdapter();
    const manager = new ScreenCacheManager(
      cache,
      metrics,
      logger as unknown as PinoLogger,
      intentKeywords,
    );

    cache.set("user-1", "balance", makeBalanceResponse());

    manager.store(
      makeRequest("buy bundle"),
      {
        screenType: "confirmation",
        screenData: {
          type: "confirmation",
          title: "Done",
          status: "success",
          message: "ok",
          details: {},
        },
        replyText: "done",
        suggestions: [],
        confidence: 0.95,
        processingSteps: [{ label: "Done", status: "done" }],
      },
      "purchase_bundle",
    );

    expect(cache.get("user-1", "balance")).toBeNull();
  });
});
