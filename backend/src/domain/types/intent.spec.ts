import {
  TelecomIntent,
  TIER1_INTENTS,
  INTENT_TOOL_MAP,
  INTENT_KEYWORDS,
} from './intent';

describe('Intent Taxonomy', () => {
  it('every TelecomIntent value maps to a tool name', () => {
    for (const intent of Object.values(TelecomIntent)) {
      expect(INTENT_TOOL_MAP[intent]).toBeDefined();
      expect(typeof INTENT_TOOL_MAP[intent]).toBe('string');
    }
  });

  it('every tool name in INTENT_TOOL_MAP matches a TOOL_REGISTRY key pattern', () => {
    const toolNames = Object.values(INTENT_TOOL_MAP);
    // All tool names should be lowercase with underscores
    for (const name of toolNames) {
      expect(name).toMatch(/^[a-z_]+$/);
    }
    // No duplicates
    expect(new Set(toolNames).size).toBe(toolNames.length);
  });

  it('TIER1_INTENTS contains exactly the 5 single-arg intents', () => {
    expect(TIER1_INTENTS.size).toBe(5);
    expect(TIER1_INTENTS.has(TelecomIntent.CHECK_BALANCE)).toBe(true);
    expect(TIER1_INTENTS.has(TelecomIntent.CHECK_USAGE)).toBe(true);
    expect(TIER1_INTENTS.has(TelecomIntent.BROWSE_BUNDLES)).toBe(true);
    expect(TIER1_INTENTS.has(TelecomIntent.GET_SUPPORT)).toBe(true);
    expect(TIER1_INTENTS.has(TelecomIntent.ACCOUNT_SUMMARY)).toBe(true);
  });

  it('TIER1_INTENTS excludes entity-extraction intents', () => {
    const tier1Values = new Set<string>(Array.from(TIER1_INTENTS));
    expect(tier1Values.has(TelecomIntent.VIEW_BUNDLE)).toBe(false);
    expect(tier1Values.has(TelecomIntent.PURCHASE_BUNDLE)).toBe(false);
    expect(tier1Values.has(TelecomIntent.TOP_UP)).toBe(false);
    expect(tier1Values.has(TelecomIntent.CREATE_TICKET)).toBe(false);
  });

  it('INTENT_KEYWORDS only has entries for TIER1 intents', () => {
    const keywordIntents = Object.keys(INTENT_KEYWORDS);
    const tier1Values = new Set<string>(Array.from(TIER1_INTENTS));
    for (const intent of keywordIntents) {
      expect(tier1Values.has(intent)).toBe(true);
    }
  });

  it('every TIER1 intent has keyword entries', () => {
    for (const intent of TIER1_INTENTS) {
      expect(INTENT_KEYWORDS[intent]).toBeDefined();
      expect(INTENT_KEYWORDS[intent].length).toBeGreaterThan(0);
    }
  });

  it('all keyword entries are lowercase strings', () => {
    for (const keywords of Object.values(INTENT_KEYWORDS)) {
      for (const kw of keywords) {
        expect(kw).toBe(kw.toLowerCase());
        expect(kw.length).toBeGreaterThan(0);
      }
    }
  });
});
