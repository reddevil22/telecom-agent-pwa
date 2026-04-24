import { lazy } from "react";
import type { ScreenRegistry } from "../types/screens";

const BalanceScreen = lazy(async () => ({
  default: (await import("./BalanceScreen/BalanceScreen")).BalanceScreen,
}));
const BundlesScreen = lazy(async () => ({
  default: (await import("./BundlesScreen/BundlesScreen")).BundlesScreen,
}));
const BundleDetailScreen = lazy(async () => ({
  default: (await import("./BundleDetailScreen/BundleDetailScreen"))
    .BundleDetailScreen,
}));
const UsageScreen = lazy(async () => ({
  default: (await import("./UsageScreen/UsageScreen")).UsageScreen,
}));
const SupportScreen = lazy(async () => ({
  default: (await import("./SupportScreen/SupportScreen")).SupportScreen,
}));
const ConfirmationScreen = lazy(async () => ({
  default: (await import("./ConfirmationScreen/ConfirmationScreen"))
    .ConfirmationScreen,
}));
const AccountScreen = lazy(async () => ({
  default: (await import("./AccountScreen/AccountScreen")).AccountScreen,
}));
const DataGiftScreen = lazy(async () => ({
  default: (await import("./DataGiftScreen/DataGiftScreen")).DataGiftScreen,
}));

export const screenRegistry: ScreenRegistry = new Map([
  ["balance", { component: BalanceScreen, displayName: "Balance" }],
  ["bundles", { component: BundlesScreen, displayName: "Bundles" }],
  [
    "bundleDetail",
    { component: BundleDetailScreen, displayName: "Bundle Details" },
  ],
  ["usage", { component: UsageScreen, displayName: "Usage" }],
  ["support", { component: SupportScreen, displayName: "Support" }],
  [
    "confirmation",
    { component: ConfirmationScreen, displayName: "Confirmation" },
  ],
  ["account", { component: AccountScreen, displayName: "Account" }],
  ["dataGift", { component: DataGiftScreen, displayName: "Data Gift" }],
]);
