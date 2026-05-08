import { createBillingAgentRegistrations } from "./billing-agents.provider";

describe("billing-agents.provider", () => {
  it("returns check_balance and top_up registrations", () => {
    const balanceBff = {
      getBalance: jest.fn(),
      topUp: jest.fn(),
    };

    const registrations = createBillingAgentRegistrations(balanceBff as never);
    const toolNames = registrations.map(
      (registration) => registration.toolName,
    );

    expect(registrations).toHaveLength(2);
    expect(toolNames).toEqual(
      expect.arrayContaining(["check_balance", "top_up"]),
    );
  });

  it("check_balance agent calls balanceBff.getBalance", async () => {
    const balanceBff = {
      getBalance: jest.fn().mockResolvedValue({
        current: 42,
        currency: "USD",
        lastTopUp: "2026-04-19",
        nextBillingDate: "2026-05-01",
      }),
      topUp: jest.fn(),
    };

    const registrations = createBillingAgentRegistrations(balanceBff as never);
    const checkBalance = registrations.find(
      (r) => r.toolName === "check_balance",
    );

    await checkBalance!.agent.handle("user-1", "session-1");

    expect(balanceBff.getBalance).toHaveBeenCalledWith("user-1");
  });

  it("top_up agent rejects non-numeric or non-positive amounts", async () => {
    const balanceBff = {
      getBalance: jest.fn(),
      topUp: jest.fn(),
    };

    const registrations = createBillingAgentRegistrations(balanceBff as never);
    const topUp = registrations.find((r) => r.toolName === "top_up");

    const nonNumeric = await topUp!.agent.handle("user-1", "session-1", { amount: "abc" });
    const nonPositive = await topUp!.agent.handle("user-1", "session-1", { amount: "0" });

    expect(nonNumeric.screenData).toMatchObject({
      type: "confirmation",
      status: "error",
    });
    expect(nonPositive.screenData).toMatchObject({
      type: "confirmation",
      status: "error",
    });
    expect(balanceBff.topUp).not.toHaveBeenCalled();
  });

  it("top_up agent calls balanceBff.topUp with parsed amount", async () => {
    const balanceBff = {
      getBalance: jest.fn(),
      topUp: jest.fn().mockResolvedValue({
        current: 55,
        currency: "USD",
        lastTopUp: "2026-04-19",
        nextBillingDate: "2026-05-01",
      }),
    };

    const registrations = createBillingAgentRegistrations(balanceBff as never);
    const topUp = registrations.find((r) => r.toolName === "top_up");

    const result = await topUp!.agent.handle("user-1", "session-1", { amount: "5" });

    expect(balanceBff.topUp).toHaveBeenCalledWith("user-1", 5);
    expect(result.screenData).toMatchObject({
      type: "confirmation",
      status: "success",
    });
  });
});
