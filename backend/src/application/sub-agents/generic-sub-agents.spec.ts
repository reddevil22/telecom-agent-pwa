import {
  ActionSubAgent,
  DualQuerySubAgent,
  SimpleQuerySubAgent,
  type ActionConfig,
} from "./generic-sub-agents";

describe("SimpleQuerySubAgent", () => {
  it("returns configured screenType and transformed result", async () => {
    const bffMethod = jest
      .fn()
      .mockResolvedValue({ current: 50, currency: "USD" });
    const transformResult = jest.fn((result: unknown) => ({ balance: result }));

    const agent = new SimpleQuerySubAgent(bffMethod, {
      screenType: "balance",
      processingLabels: { fetching: "Fetching account balance" },
      transformResult,
    });

    const result = await agent.handle("user-1", "session-1");

    expect(result.screenData.type).toBe("balance");
    expect(result.screenData).toMatchObject({
      type: "balance",
      balance: { current: 50, currency: "USD" },
    });
    expect(transformResult).toHaveBeenCalledWith({
      current: 50,
      currency: "USD",
    });
  });

  it("calls bff method with userId and returns 3 done steps", async () => {
    const bffMethod = jest.fn().mockResolvedValue({ usage: [] });
    const agent = new SimpleQuerySubAgent(bffMethod, {
      screenType: "usage",
      processingLabels: { fetching: "Fetching usage data" },
      transformResult: (result: unknown) => ({ usage: result }),
    });

    const result = await agent.handle("user-42", "session-1");

    expect(bffMethod).toHaveBeenCalledWith("user-42");
    expect(result.processingSteps).toHaveLength(3);
    expect(result.processingSteps.every((step) => step.status === "done")).toBe(
      true,
    );
  });

  it("propagates bff errors", async () => {
    const bffMethod = jest.fn().mockRejectedValue(new Error("BFF failed"));
    const agent = new SimpleQuerySubAgent(bffMethod, {
      screenType: "balance",
      processingLabels: { fetching: "Fetching account balance" },
      transformResult: (result: unknown) => ({ balance: result }),
    });

    await expect(agent.handle("user-1", "session-1")).rejects.toThrow("BFF failed");
  });
});

describe("ActionSubAgent", () => {
  function makeAgent(
    configOverrides: Partial<ActionConfig<{ amount: string }>> = {},
  ): ActionSubAgent<{ amount: string }> {
    const defaultConfig: ActionConfig<{ amount: string }> = {
      screenType: "confirmation",
      validateParams: (params) => {
        const amount = params?.["amount"];
        if (!amount) {
          return { isValid: false, error: "Missing amount" };
        }
        return { isValid: true, extractedParams: { amount } };
      },
      executeAction: async (_userId, params) => ({
        success: true,
        title: "Top-up Successful!",
        message: "Done",
        details: { amount: params.amount },
        updatedBalance: {
          current: 60,
          currency: "USD",
          lastTopUp: "2026-04-19",
          nextBillingDate: "2026-05-01",
        },
      }),
      processingLabels: {
        validating: "Validating amount",
        processing: "Processing top-up",
        updating: "Updating balance",
      },
    };

    return new ActionSubAgent({ ...defaultConfig, ...configOverrides });
  }

  it("returns error confirmation when validation fails", async () => {
    const agent = makeAgent();

    const result = await agent.handle("user-1", "session-1", {});

    expect(result.screenData).toMatchObject({
      type: "confirmation",
      status: "error",
      message: "Missing amount",
    });
    expect(result.processingSteps).toEqual([
      { label: "Validating amount", status: "done" },
    ]);
  });

  it("calls executeAction with extracted params and returns updatedBalance", async () => {
    const executeAction = jest.fn().mockResolvedValue({
      success: true,
      title: "Top-up Successful!",
      message: "Done",
      details: { amount: "5" },
      updatedBalance: {
        current: 55,
        currency: "USD",
        lastTopUp: "2026-04-19",
        nextBillingDate: "2026-05-01",
      },
    });

    const agent = makeAgent({ executeAction });
    const result = await agent.handle("user-1", "session-1", { amount: "5" });

    expect(executeAction).toHaveBeenCalledWith("user-1", { amount: "5" });
    expect(result.screenData).toMatchObject({
      type: "confirmation",
      status: "success",
    });
    expect(result.screenData).toHaveProperty("updatedBalance");
  });

  it("returns error confirmation when action result is unsuccessful", async () => {
    const executeAction = jest.fn().mockResolvedValue({
      success: false,
      title: "Top-up Failed",
      message: "Insufficient permissions",
      details: {},
    });

    const agent = makeAgent({ executeAction });
    const result = await agent.handle("user-1", "session-1", { amount: "5" });

    expect(result.screenData).toMatchObject({
      type: "confirmation",
      status: "error",
      title: "Top-up Failed",
    });
  });

  it("includes updating step only when configured", async () => {
    const withUpdating = makeAgent();
    const withoutUpdating = makeAgent({
      processingLabels: {
        validating: "Validating amount",
        processing: "Processing top-up",
      },
    });

    const resultWithUpdating = await withUpdating.handle("user-1", "session-1", {
      amount: "5",
    });
    const resultWithoutUpdating = await withoutUpdating.handle("user-1", "session-1", {
      amount: "5",
    });

    expect(
      resultWithUpdating.processingSteps.map((step) => step.label),
    ).toEqual(["Validating amount", "Processing top-up", "Updating balance"]);
    expect(
      resultWithoutUpdating.processingSteps.map((step) => step.label),
    ).toEqual(["Validating amount", "Processing top-up"]);
  });
});

describe("DualQuerySubAgent", () => {
  it("calls both bff methods and returns combined transformed result", async () => {
    const primary = jest.fn().mockResolvedValue([{ id: "t1" }]);
    const secondary = jest
      .fn()
      .mockResolvedValue([{ question: "q1", answer: "a1" }]);

    const agent = new DualQuerySubAgent(primary, secondary, {
      screenType: "support",
      processingLabels: {
        primary: "Loading support options",
        secondary: "Loading FAQ",
      },
      transformResult: (tickets, faqItems) => ({ tickets, faqItems }),
    });

    const result = await agent.handle("user-1", "session-1");

    expect(primary).toHaveBeenCalledWith("user-1");
    expect(secondary).toHaveBeenCalledWith("user-1");
    expect(result.screenData).toMatchObject({
      type: "support",
      tickets: [{ id: "t1" }],
      faqItems: [{ question: "q1", answer: "a1" }],
    });
    expect(result.processingSteps).toHaveLength(4);
    expect(result.processingSteps.every((step) => step.status === "done")).toBe(
      true,
    );
  });

  it("propagates error if primary bff fails", async () => {
    const primary = jest.fn().mockRejectedValue(new Error("primary failed"));
    const secondary = jest.fn().mockResolvedValue([]);

    const agent = new DualQuerySubAgent(primary, secondary, {
      screenType: "support",
      processingLabels: {
        primary: "Loading support options",
        secondary: "Loading FAQ",
      },
      transformResult: (tickets, faqItems) => ({ tickets, faqItems }),
    });

    await expect(agent.handle("user-1", "session-1")).rejects.toThrow("primary failed");
  });

  it("propagates error if secondary bff fails", async () => {
    const primary = jest.fn().mockResolvedValue([]);
    const secondary = jest
      .fn()
      .mockRejectedValue(new Error("secondary failed"));

    const agent = new DualQuerySubAgent(primary, secondary, {
      screenType: "support",
      processingLabels: {
        primary: "Loading support options",
        secondary: "Loading FAQ",
      },
      transformResult: (tickets, faqItems) => ({ tickets, faqItems }),
    });

    await expect(agent.handle("user-1", "session-1")).rejects.toThrow("secondary failed");
  });
});
