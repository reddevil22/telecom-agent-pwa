import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { plainToInstance } from 'class-transformer';
import { ArrayMinSize, IsArray, IsObject, IsString, validateSync } from 'class-validator';
import { INTENT_KEYWORDS, TelecomIntent, type IntentKeywordMap, type Tier1Intent } from '../domain/types/intent';

class IntentRoutingConfigFileDto {
  @IsObject()
  keywords!: Record<string, unknown>;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  actionSignals!: string[];
}

export interface IntentRoutingConfig {
  keywords: IntentKeywordMap;
  actionSignals: string[];
}

const REQUIRED_KEYWORD_INTENTS: ReadonlyArray<Tier1Intent> = [
  TelecomIntent.CHECK_BALANCE,
  TelecomIntent.CHECK_USAGE,
  TelecomIntent.BROWSE_BUNDLES,
  TelecomIntent.GET_SUPPORT,
  TelecomIntent.ACCOUNT_SUMMARY,
];

const DEFAULT_ACTION_SIGNALS = ['buy', 'purchase', 'order', 'subscribe', 'activate', 'get me', 'i want', 'i need'];

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  return Array.from(new Set(normalized));
}

function buildKeywordMap(rawKeywords: Record<string, unknown> | undefined): IntentKeywordMap {
  const source = rawKeywords ?? {};
  const keywords = Object.fromEntries(
    REQUIRED_KEYWORD_INTENTS.map((intent) => {
      const normalized = normalizeStringArray(source[intent]);
      const fallback = INTENT_KEYWORDS[intent];
      return [intent, normalized.length > 0 ? normalized : fallback];
    }),
  );

  return keywords as IntentKeywordMap;
}

export function loadIntentRoutingConfig(config: ConfigService, logger?: PinoLogger): IntentRoutingConfig {
  const pathFromEnv = config.get<string>('INTENT_KEYWORDS_PATH') ?? 'data/intent-keywords.json';
  const absolutePath = resolve(process.cwd(), pathFromEnv);

  try {
    const raw = readFileSync(absolutePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const dto = plainToInstance(IntentRoutingConfigFileDto, parsed);
    const validationErrors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: false });

    if (validationErrors.length > 0) {
      logger?.warn({ path: absolutePath, errors: validationErrors.length }, 'Invalid intent routing config; using defaults');
      return {
        keywords: INTENT_KEYWORDS,
        actionSignals: DEFAULT_ACTION_SIGNALS,
      };
    }

    const actionSignals = normalizeStringArray(dto.actionSignals);
    return {
      keywords: buildKeywordMap(dto.keywords),
      actionSignals: actionSignals.length > 0 ? actionSignals : DEFAULT_ACTION_SIGNALS,
    };
  } catch (error) {
    logger?.warn({ path: absolutePath, err: error instanceof Error ? error.message : String(error) }, 'Unable to load intent routing config; using defaults');
    return {
      keywords: INTENT_KEYWORDS,
      actionSignals: DEFAULT_ACTION_SIGNALS,
    };
  }
}