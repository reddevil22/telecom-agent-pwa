import { OpenAiCompatibleLlmAdapter } from "./openai-compatible.adapter";
import { LLM_RETRY } from "../../../domain/constants/security-constants";

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("OpenAiCompatibleLlmAdapter", () => {
  let adapter: OpenAiCompatibleLlmAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new OpenAiCompatibleLlmAdapter(
      "http://localhost:8080/v1",
      "test-key",
    );
  });

  it("sends request to correct URL with auth header", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: "Hello",
              tool_calls: [
                {
                  id: "c1",
                  type: "function",
                  function: { name: "check_balance", arguments: "{}" },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });

    await adapter.chatCompletion({
      model: "test-model",
      messages: [{ role: "user", content: "Hi" }],
      tools: [],
      temperature: 0.1,
      max_tokens: 100,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8080/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-key",
        }),
      }),
    );
  });

  it("omits Authorization header when apiKey is empty", async () => {
    const noKeyAdapter = new OpenAiCompatibleLlmAdapter(
      "http://localhost:8080/v1",
      "",
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Hi" } }],
      }),
    });

    await noKeyAdapter.chatCompletion({
      model: "test",
      messages: [{ role: "user", content: "Hi" }],
    });

    const callArgs = mockFetch.mock.calls[0][1] as {
      headers: Record<string, string>;
    };
    expect(callArgs.headers).not.toHaveProperty("Authorization");
  });

  it("parses tool calls from response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call-123",
                  type: "function",
                  function: {
                    name: "check_balance",
                    arguments: '{"userId":"u1"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 20 },
      }),
    });

    const result = await adapter.chatCompletion({
      model: "test",
      messages: [{ role: "user", content: "balance" }],
    });

    expect(result.message.tool_calls).toHaveLength(1);
    expect(result.message.tool_calls![0].function.name).toBe("check_balance");
    expect(result.usage?.prompt_tokens).toBe(50);
  });

  it("returns content-only response when no tool calls", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "I can help with that" } }],
      }),
    });

    const result = await adapter.chatCompletion({
      model: "test",
      messages: [{ role: "user", content: "help" }],
    });

    expect(result.message.content).toBe("I can help with that");
    expect(result.message.tool_calls).toBeUndefined();
  });

  it("handles missing choices gracefully", async () => {
    const mockLogger = { warn: jest.fn(), setContext: jest.fn() };
    const adapterWithLogger = new OpenAiCompatibleLlmAdapter(
      "http://localhost:8080/v1",
      "test-key",
      mockLogger as never,
    );
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [] }),
    });

    const result = await adapterWithLogger.chatCompletion({
      model: "test",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.message.content).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ responseShape: expect.any(String) }),
      "Unexpected LLM response shape",
    );
  });

  it("throws on non-OK HTTP response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    await expect(
      adapter.chatCompletion({
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("LLM request failed: 500");
  });

  it("throws descriptive timeout error when request exceeds timeout", async () => {
    const delaySpy = jest
      .spyOn(adapter as any, "delay")
      .mockResolvedValue(undefined);
    const timeoutError = new Error("Operation timed out");
    timeoutError.name = "TimeoutError";
    mockFetch
      .mockRejectedValueOnce(timeoutError)
      .mockRejectedValueOnce(timeoutError)
      .mockRejectedValueOnce(timeoutError);

    await expect(
      adapter.chatCompletion({
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("LLM request timed out");

    expect(mockFetch).toHaveBeenCalledTimes(LLM_RETRY.MAX_RETRIES + 1);
    expect(delaySpy).toHaveBeenCalledTimes(LLM_RETRY.MAX_RETRIES);

    delaySpy.mockRestore();
  });

  it("sends all parameters in request body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    });

    const params = {
      model: "llama-3",
      messages: [{ role: "user" as const, content: "test" }],
      tools: [
        {
          type: "function" as const,
          function: { name: "t", description: "d", parameters: {} },
        },
      ],
      temperature: 0.5,
      max_tokens: 256,
    };

    await adapter.chatCompletion(params);

    const callArgs = mockFetch.mock.calls[0][1] as { body: string };
    const body = JSON.parse(callArgs.body);
    expect(body).toEqual(params);
  });

  it("retries on transient 503 and succeeds on second attempt", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "Service Unavailable",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "ok-after-retry" } }],
        }),
      });

    const result = await adapter.chatCompletion({
      model: "test",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.message.content).toBe("ok-after-retry");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on timeout and succeeds on second attempt", async () => {
    const timeoutError = new Error("Operation timed out");
    timeoutError.name = "TimeoutError";

    mockFetch.mockRejectedValueOnce(timeoutError).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok-after-timeout" } }],
      }),
    });

    const result = await adapter.chatCompletion({
      model: "test",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.message.content).toBe("ok-after-timeout");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 and succeeds", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => "Too Many Requests",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "ok-after-429" } }],
        }),
      });

    const result = await adapter.chatCompletion({
      model: "test",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.message.content).toBe("ok-after-429");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 400 Bad Request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    });

    await expect(
      adapter.chatCompletion({
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("LLM request failed: 400");

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 401 Unauthorized", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    await expect(
      adapter.chatCompletion({
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("LLM request failed: 401");

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("exhausts retries and throws final error after MAX_RETRIES", async () => {
    const delaySpy = jest
      .spyOn(adapter as any, "delay")
      .mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    });

    await expect(
      adapter.chatCompletion({
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("LLM request failed: 503");

    expect(mockFetch).toHaveBeenCalledTimes(LLM_RETRY.MAX_RETRIES + 1);
    expect(delaySpy).toHaveBeenCalledTimes(LLM_RETRY.MAX_RETRIES);

    delaySpy.mockRestore();
  });

  it("uses exponential delay between retries", async () => {
    const delaySpy = jest
      .spyOn(adapter as any, "delay")
      .mockResolvedValue(undefined);

    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
    });

    await expect(
      adapter.chatCompletion({
        model: "test",
        messages: [{ role: "user", content: "hi" }],
      }),
    ).rejects.toThrow("LLM request failed: 503");

    expect(delaySpy.mock.calls.map((args) => args[0])).toEqual([
      LLM_RETRY.BASE_DELAY_MS,
      LLM_RETRY.BASE_DELAY_MS * 2,
    ]);

    delaySpy.mockRestore();
  });
});
