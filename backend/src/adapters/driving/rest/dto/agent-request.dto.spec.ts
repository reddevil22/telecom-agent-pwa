import "reflect-metadata";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AgentRequestDto } from "./agent-request.dto";
import { SECURITY_LIMITS } from "../../../../domain/constants/security-constants";

function makeValidDto(
  overrides: Partial<AgentRequestDto> = {},
): AgentRequestDto {
  return plainToInstance(AgentRequestDto, {
    prompt: "Show my balance",
    sessionId: "session-1",
    userId: "user-1",
    conversationHistory: [],
    timestamp: Date.now(),
    ...overrides,
  });
}

describe("AgentRequestDto", () => {
  it("passes validation with valid data", async () => {
    const dto = makeValidDto();
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("fails when prompt is missing", async () => {
    const dto = makeValidDto({ prompt: undefined as unknown as string });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe("prompt");
  });

  it("fails when prompt exceeds max length", async () => {
    const dto = makeValidDto({
      prompt: "x".repeat(SECURITY_LIMITS.PROMPT_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe("prompt");
  });

  it("passes when prompt is at max length", async () => {
    const dto = makeValidDto({
      prompt: "x".repeat(SECURITY_LIMITS.PROMPT_MAX_LENGTH),
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("fails when sessionId is missing", async () => {
    const dto = makeValidDto({ sessionId: undefined as unknown as string });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "sessionId")).toBe(true);
  });

  it("fails when userId is missing", async () => {
    const dto = makeValidDto({ userId: undefined as unknown as string });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "userId")).toBe(true);
  });

  it("fails when timestamp is negative", async () => {
    const dto = makeValidDto({ timestamp: -1 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "timestamp")).toBe(true);
  });

  it("truncates conversationHistory when it exceeds max entries", async () => {
    const history = Array.from(
      { length: SECURITY_LIMITS.HISTORY_MAX_ENTRIES + 1 },
      (_, i) => ({
        role: "user" as const,
        text: `msg ${i}`,
        timestamp: Date.now(),
      }),
    );
    const dto = makeValidDto({ conversationHistory: history });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.conversationHistory).toHaveLength(
      SECURITY_LIMITS.HISTORY_MAX_ENTRIES,
    );
    expect(dto.conversationHistory[0].text).toBe("msg 1");
  });

  it("passes with valid conversation history", async () => {
    const history = [
      { role: "user" as const, text: "hello", timestamp: Date.now() },
      { role: "agent" as const, text: "hi", timestamp: Date.now() },
    ];
    const dto = makeValidDto({ conversationHistory: history });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("fails when history message text exceeds max length", async () => {
    const history = [
      {
        role: "user" as const,
        text: "x".repeat(SECURITY_LIMITS.HISTORY_MESSAGE_MAX_LENGTH + 1),
        timestamp: Date.now(),
      },
    ];
    const dto = makeValidDto({ conversationHistory: history });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("fails when history message role is an unexpected string value", async () => {
    const history = [
      {
        role: "hacker" as unknown as "user",
        text: "ok",
        timestamp: Date.now(),
      },
    ];
    const dto = makeValidDto({ conversationHistory: history });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === "conversationHistory")).toBe(true);
  });

  it("fails when prompt is not a string", async () => {
    const dto = makeValidDto({ prompt: 123 as unknown as string });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "prompt")).toBe(true);
  });

  it("fails when sessionId exceeds max length", async () => {
    const dto = makeValidDto({
      sessionId: "x".repeat(SECURITY_LIMITS.SESSION_ID_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "sessionId")).toBe(true);
  });

  it("passes when sessionId is at max length", async () => {
    const dto = makeValidDto({
      sessionId: "x".repeat(SECURITY_LIMITS.SESSION_ID_MAX_LENGTH),
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("fails when userId exceeds max length", async () => {
    const dto = makeValidDto({
      userId: "x".repeat(SECURITY_LIMITS.USER_ID_MAX_LENGTH + 1),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "userId")).toBe(true);
  });

  it("passes when userId is at max length", async () => {
    const dto = makeValidDto({
      userId: "x".repeat(SECURITY_LIMITS.USER_ID_MAX_LENGTH),
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("passes with valid confirmationAction", async () => {
    const dto = makeValidDto({
      confirmationAction: {
        token: "confirm-token-1",
        decision: "confirm",
      } as AgentRequestDto["confirmationAction"],
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it("fails when confirmationAction decision is invalid", async () => {
    const dto = makeValidDto({
      confirmationAction: {
        token: "confirm-token-2",
        decision: "approve",
      } as unknown as AgentRequestDto["confirmationAction"],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("fails when confirmationAction token exceeds max length", async () => {
    const dto = makeValidDto({
      confirmationAction: {
        token: "x".repeat(SECURITY_LIMITS.CONFIRMATION_TOKEN_MAX_LENGTH + 1),
        decision: "cancel",
      } as AgentRequestDto["confirmationAction"],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
