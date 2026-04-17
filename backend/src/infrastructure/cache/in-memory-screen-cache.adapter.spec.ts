import { InMemoryScreenCacheAdapter } from "./in-memory-screen-cache.adapter";
import type { AgentResponse } from "../../domain/types/agent";

function makeResponse(screenType: AgentResponse["screenType"]): AgentResponse {
  return {
    screenType,
    screenData:
      screenType === "balance"
        ? {
            type: "balance",
            balance: {
              current: 42.5,
              currency: "USD",
              lastTopUp: "2026-04-14",
              nextBillingDate: "2026-05-01",
            },
          }
        : { type: "unknown" },
    replyText: "ok",
    suggestions: ["Show my balance"],
    confidence: 0.95,
    processingSteps: [{ label: "done", status: "done" }],
  };
}

describe("InMemoryScreenCacheAdapter", () => {
  let cache: InMemoryScreenCacheAdapter;

  beforeEach(() => {
    cache = new InMemoryScreenCacheAdapter();
  });

  afterEach(() => {
    cache.onModuleDestroy();
    jest.restoreAllMocks();
  });

  it("stores and retrieves cloned responses", () => {
    const response = makeResponse("balance");
    cache.set("user-1", "balance", response);

    const cached = cache.get("user-1", "balance");
    expect(cached).not.toBeNull();
    expect(cached).toEqual(response);
    expect(cached).not.toBe(response);
  });

  it("invalidates only a specific screen for a user", () => {
    cache.set("user-1", "balance", makeResponse("balance"));
    cache.set("user-1", "support", makeResponse("unknown"));

    cache.invalidate("user-1", "balance");

    expect(cache.get("user-1", "balance")).toBeNull();
    expect(cache.get("user-1", "support")).not.toBeNull();
  });

  it("expires entries only after ttl boundary", () => {
    const now = Date.now();
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(now);

    cache.set("user-1", "balance", makeResponse("balance"));

    nowSpy.mockReturnValue(now + 5 * 60 * 1000 - 1000);
    expect(cache.get("user-1", "balance")).not.toBeNull();

    nowSpy.mockReturnValue(now + 5 * 60 * 1000 + 1000);
    expect(cache.get("user-1", "balance")).toBeNull();
  });

  it("evicts oldest entries when max capacity is exceeded", () => {
    const now = Date.now();
    const nowSpy = jest.spyOn(Date, "now");

    for (let i = 0; i < 501; i++) {
      nowSpy.mockReturnValue(now + i);
      cache.set(`user-${i}`, "balance", makeResponse("balance"));
    }

    expect(cache.get("user-0", "balance")).toBeNull();
    expect(cache.get("user-500", "balance")).not.toBeNull();
  });

  it("keeps latest write for the same key", () => {
    const initial = makeResponse("balance");
    const updated = {
      ...makeResponse("balance"),
      replyText: "updated",
    };

    cache.set("user-1", "balance", initial);
    cache.set("user-1", "balance", updated);

    const cached = cache.get("user-1", "balance");
    expect(cached?.replyText).toBe("updated");
  });
});
