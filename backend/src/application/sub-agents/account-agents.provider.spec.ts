import { createAccountAgentRegistrations } from "./account-agents.provider";

describe("account-agents.provider", () => {
  it("returns check_usage and get_account_summary registrations", () => {
    const usageBff = { getUsage: jest.fn() };
    const telcoService = { getAccountSummary: jest.fn() };

    const registrations = createAccountAgentRegistrations(
      usageBff as never,
      telcoService as never,
    );

    expect(registrations).toHaveLength(2);
    expect(registrations.map((registration) => registration.toolName)).toEqual(
      expect.arrayContaining(["check_usage", "get_account_summary"]),
    );
  });

  it("check_usage agent calls usageBff.getUsage", async () => {
    const usageBff = { getUsage: jest.fn().mockResolvedValue([]) };
    const telcoService = { getAccountSummary: jest.fn() };

    const registrations = createAccountAgentRegistrations(
      usageBff as never,
      telcoService as never,
    );
    const checkUsage = registrations.find(
      (registration) => registration.toolName === "check_usage",
    );

    await checkUsage!.agent.handle("user-1");

    expect(usageBff.getUsage).toHaveBeenCalledWith("user-1");
  });

  it("get_account_summary agent calls telcoService.getAccountSummary", async () => {
    const usageBff = { getUsage: jest.fn() };
    const telcoService = {
      getAccountSummary: jest.fn().mockReturnValue({
        type: "account",
        profile: {},
        activeSubscriptions: [],
        recentTransactions: [],
        openTickets: [],
      }),
    };

    const registrations = createAccountAgentRegistrations(
      usageBff as never,
      telcoService as never,
    );
    const accountSummary = registrations.find(
      (registration) => registration.toolName === "get_account_summary",
    );

    await accountSummary!.agent.handle("user-1");

    expect(telcoService.getAccountSummary).toHaveBeenCalledWith("user-1");
  });
});
