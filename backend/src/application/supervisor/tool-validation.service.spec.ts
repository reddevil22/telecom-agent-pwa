import { ToolValidationService } from "./tool-validation.service";

describe("ToolValidationService", () => {
  let service: ToolValidationService;

  beforeEach(() => {
    service = new ToolValidationService();
  });

  it("accepts valid tool calls", () => {
    const error = service.validate({
      function: {
        name: "check_balance",
        arguments: JSON.stringify({ userId: "user-1" }),
      },
    });

    expect(error).toBeNull();
  });

  it("rejects unknown tool names", () => {
    const error = service.validate({
      function: {
        name: "drop_database",
        arguments: JSON.stringify({}),
      },
    });

    expect(error).toContain("Invalid tool call");
  });

  it("rejects malformed JSON arguments", () => {
    const error = service.validate({
      function: {
        name: "check_balance",
        arguments: "not-json",
      },
    });

    expect(error).toContain("Invalid tool call");
  });

  it("rejects unexpected arguments", () => {
    const error = service.validate({
      function: {
        name: "check_balance",
        arguments: JSON.stringify({ userId: "user-1", extra: "bad" }),
      },
    });

    expect(error).toContain("Invalid tool call");
  });

  it("pushes tool call error pair into loop messages", () => {
    const messages: Array<{
      role: "system" | "user" | "assistant" | "tool";
      content: string;
      tool_call_id?: string;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }> = [];

    service.pushErrorToMessages(
      messages,
      {
        id: "call-1",
        type: "function",
        function: { name: "check_balance", arguments: "{}" },
      },
      "Invalid tool call",
    );

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("assistant");
    expect(messages[1].role).toBe("tool");
    expect(messages[1].tool_call_id).toBe("call-1");
    expect(messages[1].content).toContain("Invalid tool call");
  });
});
