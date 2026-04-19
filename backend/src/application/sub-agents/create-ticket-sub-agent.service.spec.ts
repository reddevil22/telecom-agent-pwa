import { CreateTicketSubAgent } from "./create-ticket-sub-agent.service";

describe("CreateTicketSubAgent", () => {
  it("calls createTicket with explicit subject and description", async () => {
    const supportBff = {
      createTicket: jest.fn().mockResolvedValue({
        id: "TK-2001",
        status: "open",
        subject: "Billing mismatch",
        createdAt: "2026-04-19T00:00:00.000Z",
      }),
      getTickets: jest.fn(),
      getFaq: jest.fn(),
    };

    const agent = new CreateTicketSubAgent(supportBff as never);
    const result = await agent.handle("user-1", {
      subject: "Billing mismatch",
      description: "Charged twice",
    });

    expect(supportBff.createTicket).toHaveBeenCalledWith(
      "user-1",
      "Billing mismatch",
      "Charged twice",
    );
    expect(result.screenData).toMatchObject({
      type: "confirmation",
      status: "success",
      title: "Support Ticket Created",
    });
    expect(result.processingSteps).toHaveLength(2);
  });

  it("defaults subject and description when omitted", async () => {
    const supportBff = {
      createTicket: jest.fn().mockResolvedValue({
        id: "TK-2002",
        status: "open",
        subject: "General Inquiry",
        createdAt: "2026-04-19T00:00:00.000Z",
      }),
      getTickets: jest.fn(),
      getFaq: jest.fn(),
    };

    const agent = new CreateTicketSubAgent(supportBff as never);
    await agent.handle("user-1");

    expect(supportBff.createTicket).toHaveBeenCalledWith(
      "user-1",
      "General Inquiry",
      "",
    );
  });

  it("returns success confirmation with ticket details", async () => {
    const supportBff = {
      createTicket: jest.fn().mockResolvedValue({
        id: "TK-2003",
        status: "open",
        subject: "Network issue",
        createdAt: "2026-04-19T00:00:00.000Z",
      }),
      getTickets: jest.fn(),
      getFaq: jest.fn(),
    };

    const agent = new CreateTicketSubAgent(supportBff as never);
    const result = await agent.handle("user-1", {
      subject: "Network issue",
      description: "No signal",
    });

    expect(result.screenData).toMatchObject({
      type: "confirmation",
      details: {
        ticketId: "TK-2003",
        subject: "Network issue",
        status: "open",
      },
    });
  });

  it("propagates BFF error", async () => {
    const supportBff = {
      createTicket: jest
        .fn()
        .mockRejectedValue(new Error("service unavailable")),
      getTickets: jest.fn(),
      getFaq: jest.fn(),
    };

    const agent = new CreateTicketSubAgent(supportBff as never);

    await expect(
      agent.handle("user-1", {
        subject: "Network issue",
        description: "No signal",
      }),
    ).rejects.toThrow("service unavailable");
  });
});
