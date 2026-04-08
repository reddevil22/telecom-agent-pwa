/**
 * Intent Taxonomy — canonical source of truth for intent classification.
 * Frontend quick-action buttons, backend Tier 1 keywords, and fuzzy cache
 * keys must all align to this enum and its mappings.
 */

export enum TelecomIntent {
  CHECK_BALANCE = 'check_balance',
  CHECK_USAGE = 'check_usage',
  BROWSE_BUNDLES = 'browse_bundles',
  VIEW_BUNDLE = 'view_bundle',
  PURCHASE_BUNDLE = 'purchase_bundle',
  TOP_UP = 'top_up',
  GET_SUPPORT = 'get_support',
  CREATE_TICKET = 'create_ticket',
  ACCOUNT_SUMMARY = 'account_summary',
}

export interface IntentResolution {
  intent: TelecomIntent;
  /** Maps to a TOOL_REGISTRY key — the tool the supervisor should execute */
  toolName: string;
  /** Pre-resolved arguments (userId is injected by the caller) */
  args: Record<string, string>;
  /** 1.0 for Tier 1 (keyword), 0.6–0.99 for Tier 2 (fuzzy cache) */
  confidence: number;
}

/**
 * Tier 1/2-eligible intents — these require only `userId` (always available
 * from request context) and can be resolved without LLM entity extraction.
 */
export const TIER1_INTENTS: ReadonlySet<TelecomIntent> = new Set([
  TelecomIntent.CHECK_BALANCE,
  TelecomIntent.CHECK_USAGE,
  TelecomIntent.BROWSE_BUNDLES,
  TelecomIntent.GET_SUPPORT,
  TelecomIntent.ACCOUNT_SUMMARY,
]);

/**
 * Maps each TelecomIntent to the corresponding tool name in TOOL_REGISTRY.
 */
export const INTENT_TOOL_MAP: Readonly<Record<TelecomIntent, string>> = {
  [TelecomIntent.CHECK_BALANCE]: 'check_balance',
  [TelecomIntent.CHECK_USAGE]: 'check_usage',
  [TelecomIntent.BROWSE_BUNDLES]: 'list_bundles',
  [TelecomIntent.VIEW_BUNDLE]: 'view_bundle_details',
  [TelecomIntent.PURCHASE_BUNDLE]: 'purchase_bundle',
  [TelecomIntent.TOP_UP]: 'top_up',
  [TelecomIntent.GET_SUPPORT]: 'get_support',
  [TelecomIntent.CREATE_TICKET]: 'create_ticket',
  [TelecomIntent.ACCOUNT_SUMMARY]: 'get_account_summary',
};

/**
 * Keywords for Tier 1 exact-match routing.
 * Only TIER1_INTENTS have keyword lists — Tier 3 intents always need the LLM.
 */
export const INTENT_KEYWORDS: Readonly<Record<string, string[]>> = {
  [TelecomIntent.CHECK_BALANCE]: ['balance', 'credit', 'airtime', 'how much money', 'account status'],
  [TelecomIntent.CHECK_USAGE]: ['usage', 'consumption', 'remaining', 'how much data', 'minutes left'],
  [TelecomIntent.BROWSE_BUNDLES]: ['bundles', 'plans', 'packages', 'offers', 'pricing'],
  [TelecomIntent.GET_SUPPORT]: ['support', 'help', 'ticket', 'problem', 'complaint', 'faq'],
  [TelecomIntent.ACCOUNT_SUMMARY]: ['account', 'dashboard', 'profile', 'my account', 'overview'],
};
