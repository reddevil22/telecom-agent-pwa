import type { ScreenRegistry } from '../types/screens';
import { BalanceScreen } from './BalanceScreen/BalanceScreen';
import { BundlesScreen } from './BundlesScreen/BundlesScreen';
import { UsageScreen } from './UsageScreen/UsageScreen';
import { SupportScreen } from './SupportScreen/SupportScreen';

export const screenRegistry: ScreenRegistry = new Map([
  ['balance', { component: BalanceScreen, displayName: 'Balance' }],
  ['bundles', { component: BundlesScreen, displayName: 'Bundles' }],
  ['usage', { component: UsageScreen, displayName: 'Usage' }],
  ['support', { component: SupportScreen, displayName: 'Support' }],
]);
