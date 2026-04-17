import { IntentCacheService } from "./intent-cache.service";
import { TelecomIntent } from "../../domain/types/intent";

describe("IntentCacheService", () => {
  let cache: IntentCacheService;

  beforeEach(() => {
    cache = new IntentCacheService();
  });

  it("returns null for single-token prompt matches", () => {
    cache.store("user-1", "balance", TelecomIntent.CHECK_BALANCE);

    const result = cache.findBestMatch("user-1", "balance");
    expect(result).toBeNull();
  });

  it("returns exact-match intent with confidence capped at 0.99", () => {
    cache.store("user-1", "show account balance", TelecomIntent.CHECK_BALANCE);

    const result = cache.findBestMatch("user-1", "show account balance");
    expect(result).not.toBeNull();
    expect(result!.intent).toBe(TelecomIntent.CHECK_BALANCE);
    expect(result!.confidence).toBe(0.99);
  });

  it("respects similarity threshold boundaries", () => {
    const strictCache = new IntentCacheService(0.7);
    strictCache.store(
      "user-1",
      "alpha beta gamma delta epsilon",
      TelecomIntent.CHECK_USAGE,
    );

    const belowThreshold = strictCache.findBestMatch(
      "user-1",
      "alpha beta gamma",
    );
    expect(belowThreshold).toBeNull();

    const relaxedCache = new IntentCacheService(0.6);
    relaxedCache.store(
      "user-1",
      "alpha beta gamma delta epsilon",
      TelecomIntent.CHECK_USAGE,
    );

    const atThreshold = relaxedCache.findBestMatch(
      "user-1",
      "alpha beta gamma",
    );
    expect(atThreshold).not.toBeNull();
    expect(atThreshold!.intent).toBe(TelecomIntent.CHECK_USAGE);
    expect(atThreshold!.confidence).toBe(0.6);
  });

  it("returns null for disjoint token sets", () => {
    cache.store("user-1", "bundle options today", TelecomIntent.BROWSE_BUNDLES);

    const result = cache.findBestMatch("user-1", "weather forecast tomorrow");
    expect(result).toBeNull();
  });

  it("matches subset token scenarios above threshold", () => {
    cache.store(
      "user-1",
      "check account usage summary",
      TelecomIntent.CHECK_USAGE,
    );

    const result = cache.findBestMatch("user-1", "check account usage");
    expect(result).not.toBeNull();
    expect(result!.intent).toBe(TelecomIntent.CHECK_USAGE);
    expect(result!.confidence).toBeCloseTo(3 / 4, 5);
  });

  it("expires cache entries after ttl", () => {
    const now = Date.now();
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(now);

    cache.store("user-1", "show account balance", TelecomIntent.CHECK_BALANCE);

    nowSpy.mockReturnValue(now + 6 * 60 * 1000);
    const result = cache.findBestMatch("user-1", "show account balance");
    expect(result).toBeNull();

    nowSpy.mockRestore();
  });

  it("keeps entry valid just before ttl boundary and expires right after", () => {
    const now = Date.now();
    const nowSpy = jest.spyOn(Date, "now");
    nowSpy.mockReturnValue(now);

    cache.store("user-1", "show account balance", TelecomIntent.CHECK_BALANCE);

    nowSpy.mockReturnValue(now + 5 * 60 * 1000 - 1000);
    const stillValid = cache.findBestMatch("user-1", "show account balance");
    expect(stillValid).not.toBeNull();

    nowSpy.mockReturnValue(now + 5 * 60 * 1000 + 1000);
    const expired = cache.findBestMatch("user-1", "show account balance");
    expect(expired).toBeNull();

    nowSpy.mockRestore();
  });

  it("evicts least recently seen users when cache exceeds max users", () => {
    for (let i = 0; i < 1001; i++) {
      cache.store(
        `user-${i}`,
        "show account balance",
        TelecomIntent.CHECK_BALANCE,
      );
    }

    const evicted = cache.findBestMatch("user-0", "show account balance");
    expect(evicted).toBeNull();

    const retained = cache.findBestMatch("user-1000", "show account balance");
    expect(retained).not.toBeNull();
  });

  it("updates existing intent entry with latest token set", () => {
    cache.store("user-1", "show account balance", TelecomIntent.CHECK_BALANCE);
    cache.store(
      "user-1",
      "remaining credit today",
      TelecomIntent.CHECK_BALANCE,
    );

    const stalePrompt = cache.findBestMatch("user-1", "show account balance");
    expect(stalePrompt).toBeNull();

    const updatedPrompt = cache.findBestMatch(
      "user-1",
      "remaining credit today",
    );
    expect(updatedPrompt).not.toBeNull();
    expect(updatedPrompt!.intent).toBe(TelecomIntent.CHECK_BALANCE);
  });
});
