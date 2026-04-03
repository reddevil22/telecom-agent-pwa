export const SECURITY_LIMITS = {
  PROMPT_MAX_LENGTH: 1000,
  HISTORY_MESSAGE_MAX_LENGTH: 500,
  HISTORY_MAX_ENTRIES: 20,
  SUPERVISOR_HISTORY_CAP: 10,
  SUPERVISOR_MAX_ITERATIONS: 3,
  TOTAL_CHARS_BUDGET: 8000,
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX_REQUESTS: 10,
  RATE_LIMIT_CLEANUP_INTERVAL_MS: 120_000,
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

export const ALLOWED_TOOLS: ReadonlySet<string> = new Set([
  'check_balance',
  'list_bundles',
  'check_usage',
  'get_support',
]);

export const TOOL_ARG_SCHEMAS: Readonly<Record<string, readonly string[]>> = {
  check_balance: ['userId'],
  list_bundles: ['userId'],
  check_usage: ['userId'],
  get_support: ['userId'],
};
