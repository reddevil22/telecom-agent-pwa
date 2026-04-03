import type { LlmPort, LlmChatResponse } from '../../../domain/ports/llm.port';
import type { PinoLogger } from 'nestjs-pino';

export class OpenAiCompatibleLlmAdapter implements LlmPort {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly logger: PinoLogger | null;

  constructor(baseUrl: string, apiKey: string, logger?: PinoLogger) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.logger = logger ?? null;
    this.logger?.setContext(OpenAiCompatibleLlmAdapter.name);
  }

  async chatCompletion(params: {
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
    tools?: import('../../../domain/ports/llm.port').LlmToolDefinition[];
    temperature?: number;
    max_tokens?: number;
  }): Promise<LlmChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger?.error({ status: response.status, body, duration: Date.now() - startTime }, 'LLM request failed');
      throw new Error(`LLM request failed: ${response.status} ${body}`);
    }

    const raw = (await response.json()) as {
      choices?: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: 'function';
            function: { name: string; arguments: string };
          }>;
        };
      }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const duration = Date.now() - startTime;

    // OpenAI-compatible APIs wrap the message in choices[0]
    const choice = raw.choices?.[0];
    if (!choice?.message) {
      this.logger?.warn({ responseShape: JSON.stringify(raw).slice(0, 500), duration }, 'Unexpected LLM response shape');
      return { message: { content: null }, usage: raw.usage };
    }

    this.logger?.debug({
      model: params.model,
      duration,
      promptTokens: raw.usage?.prompt_tokens,
      completionTokens: raw.usage?.completion_tokens,
      hasToolCalls: !!choice.message.tool_calls?.length,
    }, 'LLM chat completion');

    return {
      message: choice.message,
      usage: raw.usage,
    };
  }
}
