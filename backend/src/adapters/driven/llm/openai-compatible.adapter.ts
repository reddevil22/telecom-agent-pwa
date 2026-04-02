import type { LlmPort, LlmChatResponse } from '../../../domain/ports/llm.port';

export class OpenAiCompatibleLlmAdapter implements LlmPort {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async chatCompletion(params: {
    model: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    tools?: import('../../../domain/ports/llm.port').LlmToolDefinition[];
    temperature?: number;
    max_tokens?: number;
  }): Promise<LlmChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status} ${await response.text()}`);
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

    // OpenAI-compatible APIs wrap the message in choices[0]
    const choice = raw.choices?.[0];
    if (!choice?.message) {
      console.log('[LlmAdapter] Unexpected response shape:', JSON.stringify(raw).slice(0, 500));
      return { message: { content: null }, usage: raw.usage };
    }

    return {
      message: choice.message,
      usage: raw.usage,
    };
  }
}
