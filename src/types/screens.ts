import type { ComponentType } from 'react';
import type { ScreenData } from './agent';

export interface ScreenDefinition {
  component: ComponentType<{ data: ScreenData }>;
  displayName: string;
}

export type ScreenRegistry = Map<string, ScreenDefinition>;
