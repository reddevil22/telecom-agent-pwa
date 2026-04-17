import type { TelecomIntent } from '../types/intent';

export interface IntentCacheMatch {
  intent: TelecomIntent;
  confidence: number;
}

export interface IntentCachePort {
  findBestMatch(userId: string, prompt: string): IntentCacheMatch | null;
  store(userId: string, prompt: string, intent: TelecomIntent): void;
}
