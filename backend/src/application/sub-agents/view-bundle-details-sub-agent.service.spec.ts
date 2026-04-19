import { ViewBundleDetailsSubAgent } from "./view-bundle-details-sub-agent.service";

describe("ViewBundleDetailsSubAgent", () => {
  it("returns unknown screen when bundleId is missing", async () => {
    const bundlesBff = { getBundles: jest.fn() };
    const balanceBff = { getBalance: jest.fn() };

    const agent = new ViewBundleDetailsSubAgent(
      bundlesBff as never,
      balanceBff as never,
    );
    const result = await agent.handle("user-1");

    expect(result.screenData).toEqual({ type: "unknown" });
    expect(result.processingSteps).toEqual([
      { label: "Validating bundle ID", status: "done" },
    ]);
    expect(bundlesBff.getBundles).not.toHaveBeenCalled();
  });

  it("returns unknown screen when bundle is not found", async () => {
    const bundlesBff = { getBundles: jest.fn().mockResolvedValue([]) };
    const balanceBff = { getBalance: jest.fn() };

    const agent = new ViewBundleDetailsSubAgent(
      bundlesBff as never,
      balanceBff as never,
    );
    const result = await agent.handle("user-1", { bundleId: "b99" });

    expect(result.screenData).toEqual({ type: "unknown" });
    expect(result.processingSteps).toEqual([
      { label: "Finding bundle", status: "done" },
    ]);
    expect(balanceBff.getBalance).not.toHaveBeenCalled();
  });

  it("returns bundleDetail screen and includes 3 processing steps", async () => {
    const bundlesBff = {
      getBundles: jest.fn().mockResolvedValue([
        {
          id: "b4",
          name: "Weekend Pass",
          description: "desc",
          price: 4.99,
          currency: "USD",
          dataGB: 1,
          minutes: 0,
          sms: 0,
          validity: "2 days",
        },
      ]),
    };
    const balanceBff = {
      getBalance: jest.fn().mockResolvedValue({
        current: 30,
        currency: "USD",
        lastTopUp: "2026-04-19",
        nextBillingDate: "2026-05-01",
      }),
    };

    const agent = new ViewBundleDetailsSubAgent(
      bundlesBff as never,
      balanceBff as never,
    );
    const result = await agent.handle("user-1", { bundleId: "b4" });

    expect(bundlesBff.getBundles).toHaveBeenCalledWith("user-1");
    expect(balanceBff.getBalance).toHaveBeenCalledWith("user-1");
    expect(result.screenData).toMatchObject({
      type: "bundleDetail",
      bundle: { id: "b4" },
      currentBalance: { current: 30, currency: "USD" },
    });
    expect(result.processingSteps).toHaveLength(3);

    const bundlesCall = bundlesBff.getBundles.mock.invocationCallOrder[0];
    const balanceCall = balanceBff.getBalance.mock.invocationCallOrder[0];
    expect(bundlesCall).toBeLessThan(balanceCall);
  });
});
