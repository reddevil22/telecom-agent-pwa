import type { ScreenRegistry } from '../types/screens';
import { BalanceScreen } from './BalanceScreen/BalanceScreen';
import { BundlesScreen } from './BundlesScreen/BundlesScreen';
import { BundleDetailScreen } from './BundleDetailScreen/BundleDetailScreen';
import { UsageScreen } from './UsageScreen/UsageScreen';
import { SupportScreen } from './SupportScreen/SupportScreen';
import { ConfirmationScreen } from './ConfirmationScreen/ConfirmationScreen';
import { AccountScreen } from './AccountScreen/AccountScreen';

export const screenRegistry: ScreenRegistry = new Map([
  ['balance', { component: BalanceScreen, displayName: 'Balance' }],
  ['bundles', { component: BundlesScreen, displayName: 'Bundles' }],
  ['bundleDetail', { component: BundleDetailScreen, displayName: 'Bundle Details' }],
  ['usage', { component: UsageScreen, displayName: 'Usage' }],
  ['support', { component: SupportScreen, displayName: 'Support' }],
  ['confirmation', { component: ConfirmationScreen, displayName: 'Confirmation' }],
  ['account', { component: AccountScreen, displayName: 'Account' }],
]);
