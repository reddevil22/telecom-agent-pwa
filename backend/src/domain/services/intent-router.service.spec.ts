import { IntentRouterService } from './intent-router.service';
import { TelecomIntent, TIER1_INTENTS, INTENT_TOOL_MAP } from '../types/intent';
import type { IntentCacheService } from '../../application/supervisor/intent-cache.service';

describe('IntentRouterService', () => {
  let router: IntentRouterService;
  let mockCache: { findBestMatch: jest.Mock; store: jest.Mock };

  beforeEach(() => {
    mockCache = {
      findBestMatch: jest.fn().mockReturnValue(null),
      store: jest.fn(),
    };
    router = new IntentRouterService(mockCache as unknown as IntentCacheService);
  });

  // ── Tier 1: Exact keyword matching ───────────────────────────

  describe('Tier 1 — exact keyword match', () => {
    it.each([
      ['show my balance', TelecomIntent.CHECK_BALANCE],
      ['what is my credit', TelecomIntent.CHECK_BALANCE],
      ['how much airtime do I have', TelecomIntent.CHECK_BALANCE],
      ['check my usage', TelecomIntent.CHECK_USAGE],
      ['data consumption this month', TelecomIntent.CHECK_USAGE],
      ['how much data remaining', TelecomIntent.CHECK_USAGE],
      ['what bundles are available', TelecomIntent.BROWSE_BUNDLES],
      ['show me your plans', TelecomIntent.BROWSE_BUNDLES],
      ['I need support', TelecomIntent.GET_SUPPORT],
      ['help me with a problem', TelecomIntent.GET_SUPPORT],
      ['show my account', TelecomIntent.ACCOUNT_SUMMARY],
      ['my dashboard', TelecomIntent.ACCOUNT_SUMMARY],
      ['account overview', TelecomIntent.ACCOUNT_SUMMARY],
    ] as const)('classifies "%s" as %s', async (prompt, expectedIntent) => {
      const result = await router.classify(prompt, 'user-1');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe(expectedIntent);
      expect(result!.confidence).toBe(1.0);
    });

    it('sets userId in args from the request', async () => {
      const result = await router.classify('show my balance', 'user-42');
      expect(result!.args.userId).toBe('user-42');
    });

    it('maps intent to correct tool name via INTENT_TOOL_MAP', async () => {
      const result = await router.classify('check my usage', 'user-1');
      expect(result!.toolName).toBe(INTENT_TOOL_MAP[TelecomIntent.CHECK_USAGE]);
    });

    it('is case-insensitive', async () => {
      const result = await router.classify('SHOW MY BALANCE', 'user-1');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe(TelecomIntent.CHECK_BALANCE);
    });
  });

  // ── Tier 1: Only single-match returns result ─────────────────

  describe('Tier 1 — ambiguous matches', () => {
    it('prefers a specific balance intent for overlapping account/balance phrasing', async () => {
      const result = await router.classify('account balance', 'user-1');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe(TelecomIntent.CHECK_BALANCE);
      expect(result!.toolName).toBe(INTENT_TOOL_MAP[TelecomIntent.CHECK_BALANCE]);
    });

    it('supports configurable action signal phrases', async () => {
      const customRouter = new IntentRouterService(
        mockCache as unknown as IntentCacheService,
        {
          [TelecomIntent.CHECK_BALANCE]: ['balance'],
          [TelecomIntent.CHECK_USAGE]: ['usage'],
          [TelecomIntent.BROWSE_BUNDLES]: ['bundles'],
          [TelecomIntent.GET_SUPPORT]: ['support'],
          [TelecomIntent.ACCOUNT_SUMMARY]: ['account'],
        },
        ['sign me up'],
      );

      const result = await customRouter.classify('sign me up for bundles', 'user-1');
      expect(result).toBeNull();
    });
  });

  // ── Tier 2: Fuzzy cache fallback ─────────────────────────────

  describe('Tier 2 — fuzzy cache fallback', () => {
    it('returns cached result when Tier 1 does not match', async () => {
      mockCache.findBestMatch.mockReturnValue({
        intent: TelecomIntent.CHECK_BALANCE,
        confidence: 0.75,
      });

      // "funds left" — no exact keyword match, but cache has a fuzzy hit
      const result = await router.classify('funds left on my number', 'user-1');
      expect(result).not.toBeNull();
      expect(result!.intent).toBe(TelecomIntent.CHECK_BALANCE);
      expect(result!.confidence).toBe(0.75);
      expect(result!.toolName).toBe('check_balance');
    });

    it('passes tokenized prompt to cache', async () => {
      mockCache.findBestMatch.mockReturnValue(null);
      await router.classify('some random prompt', 'user-1');
      expect(mockCache.findBestMatch).toHaveBeenCalled();
    });
  });

  // ── Tier 3: Entity-extraction intents always bypass ──────────

  describe('Tier 3 — entity-extraction intents route to LLM when no keyword match', () => {
    it.each([
      'buy the Value Plus bundle',
      'purchase starter pack',
      'buy travel roaming bundle',
      'I want to order the Unlimited Pro plan',
      'subscribe to Value Plus',
      'top up 20 dollars',
      'recharge my phone with 50',
    ])('returns null for "%s" (action signal prevents BROWSE_BUNDLES)', async (prompt) => {
      const result = await router.classify(prompt, 'user-1');
      expect(result).toBeNull();
    });

    // "report a network problem" matches "problem" → GET_SUPPORT (correct Tier 1)
    // "create a ticket for slow internet" matches "ticket" → GET_SUPPORT (correct Tier 1)
    // These are valid Tier 1 matches because get_support is a Tier 1 intent.
    // Entity extraction (ticket subject/description) happens in the sub-agent.
  });

  // ── Truly unknown input ──────────────────────────────────────

  describe('unknown input', () => {
    it('returns null for gibberish', async () => {
      const result = await router.classify('asdfghjkl qwerty', 'user-1');
      expect(result).toBeNull();
    });

    it('returns null for non-telecom queries', async () => {
      mockCache.findBestMatch.mockReturnValue(null);
      const result = await router.classify('what is the weather today', 'user-1');
      expect(result).toBeNull();
    });
  });
});
