import { PurchaseBundleSubAgent } from "./purchase-bundle-sub-agent.service";

describe("PurchaseBundleSubAgent", () => {
  it("returns error confirmation when bundleId is missing", async () => {
    const bundlesBff = {
      purchaseBundle: jest.fn(),
      getBundles: jest.fn(),
    };

    const agent = new PurchaseBundleSubAgent(bundlesBff as never);
    const result = await agent.handle("user-1");

    expect(result.screenData).toMatchObject({
      type: "confirmation",
      status: "error",
      title: "Purchase Failed",
    });
    expect(result.processingSteps).toEqual([
      { label: "Validating bundle", status: "done" },
    ]);
    expect(bundlesBff.purchaseBundle).not.toHaveBeenCalled();
  });

  it("returns error confirmation when bundleId is empty", async () => {
    const bundlesBff = {
      purchaseBundle: jest.fn(),
      getBundles: jest.fn(),
    };

    const agent = new PurchaseBundleSubAgent(bundlesBff as never);
    const result = await agent.handle("user-1", { bundleId: "" });

    expect(result.screenData).toMatchObject({
      type: "confirmation",
      status: "error",
    });
    expect(bundlesBff.purchaseBundle).not.toHaveBeenCalled();
  });

  it("calls purchaseBundle and returns success confirmation details", async () => {
    const bundlesBff = {
      purchaseBundle: jest.fn().mockResolvedValue({
        success: true,
        message: "Bundle purchased successfully",
        bundle: {
          id: "b4",
          name: "Weekend Pass",
          price: 4.99,
          currency: "USD",
          description: "desc",
          dataGB: 1,
          minutes: 0,
          sms: 0,
          validity: "2 days",
        },
        balance: {
          current: 45.01,
          currency: "USD",
          lastTopUp: "2026-04-19",
          nextBillingDate: "2026-05-01",
        },
      }),
      getBundles: jest.fn(),
    };

    const agent = new PurchaseBundleSubAgent(bundlesBff as never);
    const result = await agent.handle("user-1", { bundleId: "b4" });

    expect(bundlesBff.purchaseBundle).toHaveBeenCalledWith("user-1", "b4");
    expect(result.screenData).toMatchObject({
      type: "confirmation",
      status: "success",
      title: "Bundle Purchased!",
    });
    expect(result.processingSteps).toHaveLength(3);
  });

  it("returns error confirmation when purchase fails", async () => {
    const bundlesBff = {
      purchaseBundle: jest.fn().mockResolvedValue({
        success: false,
        message: "Insufficient balance",
        bundle: null,
        balance: {
          current: 1.0,
          currency: "USD",
          lastTopUp: "2026-04-19",
          nextBillingDate: "2026-05-01",
        },
      }),
      getBundles: jest.fn(),
    };

    const agent = new PurchaseBundleSubAgent(bundlesBff as never);
    const result = await agent.handle("user-1", { bundleId: "b4" });

    expect(result.screenData).toMatchObject({
      type: "confirmation",
      status: "error",
      title: "Purchase Failed",
      message: "Insufficient balance",
    });
  });
});
