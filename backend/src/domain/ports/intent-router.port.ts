import type { IntentResolution } from '../types/intent';

export interface IntentRouterPort {
  /**
   * Classify a user prompt into a resolved intent.
   * Returns null if no deterministic classification is possible
   * (caller should fall through to LLM).
   */
  classify(prompt: string, userId: string): Promise<IntentResolution | null>;
}
