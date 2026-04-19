import type { LlmPort, LlmChatResponse } from "../../../domain/ports/llm.port";
import type { PinoLogger } from "nestjs-pino";
import { LLM_RETRY } from "../../../domain/constants/security-constants";

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
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= LLM_RETRY.MAX_RETRIES; attempt += 1) {
      try {
        return await this.requestOnce(params);
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        lastError = normalizedError;

        if (
          attempt >= LLM_RETRY.MAX_RETRIES ||
          !this.isTransientError(normalizedError)
        ) {
          throw normalizedError;
        }

        const delayMs = LLM_RETRY.BASE_DELAY_MS * Math.pow(2, attempt);
        this.logger?.warn(
          {
            attempt: attempt + 1,
            delayMs,
            err: normalizedError.message,
          },
          "LLM transient error, retrying",
        );
        await this.delay(delayMs);
      }
    }

    throw lastError ?? new Error("LLM request failed with unknown error");
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

    return LLM_RETRY.RETRYABLE_STATUS_CODES.some((code) =>
      error.message.includes(`LLM request failed: ${code}`),
    );
  }

  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}
