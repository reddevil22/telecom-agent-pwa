import { ContextManagerService } from "./context-manager.service";
import type { AgentRequest } from "../../domain/types/agent";
import type { LlmPort } from "../../domain/ports/llm.port";

function makeRequest(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    prompt: "Show my balance",
    sessionId: "session-1",
    userId: "user-1",
    conversationHistory: [],
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeHistory(count: number, charsPerMessage: number) {
  const now = Date.now();
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? ("user" as const) : ("agent" as const),
    text: `${index}-${"x".repeat(charsPerMessage)}`,
    timestamp: now + index,
  }));
}

describe("ContextManagerService", () => {
  const systemPrompt = "System prompt";
  let llm: LlmPort;

  beforeEach(() => {
    llm = {
      chatCompletion: jest.fn().mockResolvedValue({
        message: { content: "- user wants balance\n- no unresolved blockers" },
      }),
    } as unknown as LlmPort;
  });

  it("keeps raw history when under summarization threshold", async () => {
    const service = new ContextManagerService(llm, "test-model", null);

    const messages = await service.buildMessages(
      makeRequest({ conversationHistory: makeHistory(3, 80) }),
      systemPrompt,
    );

    expect(messages[0]).toEqual({ role: "system", content: systemPrompt });
    expect(messages[messages.length - 1].content).toContain("userId: user-1");
    expect(llm.chatCompletion).not.toHaveBeenCalled();
  });

  it("summarizes older messages once threshold is crossed", async () => {
    const service = new ContextManagerService(llm, "test-model", null);

    const messages = await service.buildMessages(
      makeRequest({ conversationHistory: makeHistory(8, 950) }),
      systemPrompt,
    );

    expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
    expect(messages[1].role).toBe("system");
    expect(messages[1].content).toContain("Conversation summary:");
    expect(messages[messages.length - 1].role).toBe("user");
  });

  it("does not re-summarize while still above threshold in same session", async () => {
    const service = new ContextManagerService(llm, "test-model", null);

    await service.buildMessages(
      makeRequest({ conversationHistory: makeHistory(8, 950) }),
      systemPrompt,
    );

    await service.buildMessages(
      makeRequest({ conversationHistory: makeHistory(9, 980) }),
      systemPrompt,
    );

    expect(llm.chatCompletion).toHaveBeenCalledTimes(1);
  });

  it("summarizes again after dropping below and crossing threshold again", async () => {
    const service = new ContextManagerService(llm, "test-model", null);

    await service.buildMessages(
      makeRequest({ conversationHistory: makeHistory(8, 950) }),
      systemPrompt,
    );

    await service.buildMessages(
      makeRequest({ conversationHistory: makeHistory(2, 100) }),
      systemPrompt,
    );

    await service.buildMessages(
      makeRequest({ conversationHistory: makeHistory(8, 960) }),
      systemPrompt,
    );

    expect(llm.chatCompletion).toHaveBeenCalledTimes(2);
  });
});
