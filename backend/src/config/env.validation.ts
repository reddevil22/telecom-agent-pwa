export const envValidationSchema = {
  LLM_BASE_URL: { type: 'string', default: 'http://localhost:8080/v1' },
  LLM_API_KEY: { type: 'string', default: '' },
  LLM_MODEL_NAME: { type: 'string', default: 'meta-llama/Llama-3-70b' },
  LLM_TEMPERATURE: { type: 'number', default: 0.1 },
  LLM_MAX_TOKENS: { type: 'number', default: 1024 },
  PORT: { type: 'number', default: 3001 },
  NODE_ENV: { type: 'string', default: 'development' },
  LOG_LEVEL: { type: 'string', default: 'info' },
};
