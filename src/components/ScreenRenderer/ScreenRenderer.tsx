import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { orchestratorMachine } from '../../machines/orchestratorMachine';
import { selectCurrentScreenType, selectCurrentScreenData } from '../../hooks/useSelectors';
import { screenRegistry } from '../../screens/registry';

type Actor = ActorRefFrom<typeof orchestratorMachine>;

interface Props {
  actor: Actor;
}

export function ScreenRenderer({ actor }: Props) {
  const screenType = useSelector(actor, selectCurrentScreenType);
  const screenData = useSelector(actor, selectCurrentScreenData);

  if (!screenType || !screenData) return null;

  const entry = screenRegistry.get(screenType);
  if (!entry) return null;

  const Component = entry.component;

  return <Component data={screenData} actor={actor} />;
}
