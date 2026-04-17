import type { LlmPort, LlmChatResponse } from "../../../domain/ports/llm.port";
import type { PinoLogger } from "nestjs-pino";

export class OpenAiCompatibleLlmAdapter implements LlmPort {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly logger: PinoLogger | null;

  constructor(
    baseUrl: string,
    apiKey: string,
    logger?: PinoLogger,
    timeoutMs = 30_000,
  ) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.timeoutMs = Number.isFinite(timeoutMs)
      ? Math.max(1, timeoutMs)
      : 30_000;
    this.logger = logger ?? null;
    this.logger?.setContext(OpenAiCompatibleLlmAdapter.name);
  }

  async chatCompletion(params: {
    model: string;
    messages: Array<{
      role: "system" | "user" | "assistant" | "tool";
      content: string;
    }>;
    tools?: import("../../../domain/ports/llm.port").LlmToolDefinition[];
    tool_choice?: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<LlmChatResponse> {
    try {
      return await this.requestOnce(params);
    } catch (error) {
      if (!this.isTransientError(error)) {
        throw error;
      }

      this.logger?.warn(
        {
          err: error instanceof Error ? error.message : String(error),
        },
        "LLM transient error, retrying once",
      );
      await this.delay(1000);
      return this.requestOnce(params);
    }
  }

  private async requestOnce(params: {
    model: string;
    messages: Array<{
      role: "system" | "user" | "assistant" | "tool";
      content: string;
    }>;
    tools?: import("../../../domain/ports/llm.port").LlmToolDefinition[];
    tool_choice?: string;
    temperature?: number;
    max_tokens?: number;
  }): Promise<LlmChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const startTime = Date.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      if (
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError")
      ) {
        this.logger?.error(
          { duration, timeoutMs: this.timeoutMs },
          "LLM request timed out",
        );
        throw new Error(`LLM request timed out after ${this.timeoutMs}ms`);
      }

      this.logger?.error(
        {
          duration,
          err: error instanceof Error ? error.message : String(error),
        },
        "LLM network request failed",
      );
      throw new Error(
        `LLM network request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!response.ok) {
      const body = await response.text();
      this.logger?.error(
        { status: response.status, body, duration: Date.now() - startTime },
        "LLM request failed",
      );
      throw new Error(`LLM request failed: ${response.status} ${body}`);
    }

    const raw = (await response.json()) as {
      choices?: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
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
      this.logger?.warn(
        { responseShape: JSON.stringify(raw).slice(0, 500), duration },
        "Unexpected LLM response shape",
      );
      return { message: { content: null }, usage: raw.usage };
    }

    this.logger?.debug(
      {
        model: params.model,
        duration,
        promptTokens: raw.usage?.prompt_tokens,
        completionTokens: raw.usage?.completion_tokens,
        hasToolCalls: !!choice.message.tool_calls?.length,
      },
      "LLM chat completion",
    );

    return {
      message: choice.message,
      usage: raw.usage,
    };
  }

  private isTransientError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    if (error.message.includes("timed out")) {
      return true;
    }

    if (error.message.includes("network request failed")) {
      return true;
    }

    return /LLM request failed: (502|503|504)\b/.test(error.message);
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
