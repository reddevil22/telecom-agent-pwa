import type { ComponentType, LazyExoticComponent } from 'react';
import type { ActorRefFrom } from 'xstate';
import type { ScreenData } from './agent';
import type { orchestratorMachine } from '../machines/orchestratorMachine';

export type ScreenActor = ActorRefFrom<typeof orchestratorMachine>;

export interface ScreenProps {
  data: ScreenData;
  actor: ScreenActor;
}

export interface ScreenDefinition {
  component: ComponentType<ScreenProps> | LazyExoticComponent<ComponentType<ScreenProps>>;
  displayName: string;
}

export type ScreenRegistry = Map<string, ScreenDefinition>;
