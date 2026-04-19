import { createSupportAgentRegistrations } from "./support-agents.provider";

describe("support-agents.provider", () => {
  it("returns get_support and create_ticket registrations", () => {
    const supportBff = {
      getTickets: jest.fn(),
      getFaq: jest.fn(),
      createTicket: jest.fn(),
    };

    const registrations = createSupportAgentRegistrations(supportBff as never);

    expect(registrations).toHaveLength(2);
    expect(registrations.map((registration) => registration.toolName)).toEqual(
      expect.arrayContaining(["get_support", "create_ticket"]),
    );
  });

  it("get_support agent calls getTickets and getFaq", async () => {
    const supportBff = {
      getTickets: jest.fn().mockResolvedValue([]),
      getFaq: jest.fn().mockResolvedValue([]),
      createTicket: jest.fn(),
    };

    const registrations = createSupportAgentRegistrations(supportBff as never);
    const getSupport = registrations.find(
      (registration) => registration.toolName === "get_support",
    );

    const result = await getSupport!.agent.handle("user-1");

    expect(supportBff.getTickets).toHaveBeenCalledWith("user-1");
    expect(supportBff.getFaq).toHaveBeenCalled();
    expect(result.screenData.type).toBe("support");
  });
});
