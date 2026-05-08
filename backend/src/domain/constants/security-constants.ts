export const SECURITY_LIMITS = {
  PROMPT_MAX_LENGTH: 1000,
  HISTORY_MESSAGE_MAX_LENGTH: 500,
  HISTORY_MAX_ENTRIES: 20,
  SUPERVISOR_HISTORY_CAP: 10,
  SUPERVISOR_MAX_ITERATIONS: 3,
  SUPERVISOR_MAX_TOKENS_PER_REQUEST: 2048,
  TOTAL_CHARS_BUDGET: 8000,
  SUB_AGENT_FAILURE_THRESHOLD: 3,
  SUB_AGENT_DISABLE_MS: 30_000,
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX_REQUESTS: 10,
  RATE_LIMIT_CLEANUP_INTERVAL_MS: 120_000,
  SESSION_ID_MAX_LENGTH: 128,
  USER_ID_MAX_LENGTH: 128,
  CONFIRMATION_TOKEN_MAX_LENGTH: 128,
  CONFIRMATION_TTL_MS: 5 * 60 * 1000,
} as const;

export const LLM_RETRY = {
  MAX_RETRIES: 2,
  BASE_DELAY_MS: 500,
  RETRYABLE_STATUS_CODES: [429, 502, 503, 504],
} as const;

export const BLOCKED_PATTERNS: readonly RegExp[] = [
  /ignore\s+(\w+\s+)?(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now/i,
  /^system:/im,
  /<\|im_start\|>/,
  /\[INST\]/i,
  /DAN\s+mode/i,
  /jailbreak/i,
  /pretend\s+you\s+are/i,
  /act\s+as\s+if\s+you/i,
  /disregard\s+(your|all|the)\s+(previous|above|earlier|prior)/i,
  /new\s+instructions?\s*:/i,
  /forget\s+(your|all|the)\s+(previous|above|earlier|prior|instructions)/i,
  /override\s+(your|the)\s+(system|previous|original)\s+(prompt|instructions)/i,
];

// Re-export from tool-registry for backward compatibility
export {
  ALLOWED_TOOLS,
  TOOL_ARG_SCHEMAS,
  TOOL_ARG_CONSTRAINTS,
} from "./tool-registry";
