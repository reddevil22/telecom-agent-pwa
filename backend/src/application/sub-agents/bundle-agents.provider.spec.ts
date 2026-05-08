import { createBundleAgentRegistrations } from "./bundle-agents.provider";

describe("bundle-agents.provider", () => {
  it("returns list_bundles, view_bundle_details, and purchase_bundle registrations", () => {
    const bundlesBff = {
      getBundles: jest.fn(),
      purchaseBundle: jest.fn(),
    };
    const balanceBff = { getBalance: jest.fn() };

    const registrations = createBundleAgentRegistrations(
      bundlesBff as never,
      balanceBff as never,
    );

    expect(registrations).toHaveLength(3);
    expect(registrations.map((registration) => registration.toolName)).toEqual(
      expect.arrayContaining([
        "list_bundles",
        "view_bundle_details",
        "purchase_bundle",
      ]),
    );
  });

  it("list_bundles agent calls bundlesBff.getBundles", async () => {
    const bundlesBff = {
      getBundles: jest.fn().mockResolvedValue([]),
      purchaseBundle: jest.fn(),
    };
    const balanceBff = { getBalance: jest.fn() };

    const registrations = createBundleAgentRegistrations(
      bundlesBff as never,
      balanceBff as never,
    );
    const listBundles = registrations.find(
      (registration) => registration.toolName === "list_bundles",
    );

    await listBundles!.agent.handle("user-1", "session-1");

    expect(bundlesBff.getBundles).toHaveBeenCalledWith("user-1");
  });
});
