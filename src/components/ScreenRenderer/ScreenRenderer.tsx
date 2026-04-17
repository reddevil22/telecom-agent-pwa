import { Suspense } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { orchestratorMachine } from '../../machines/orchestratorMachine';
import { selectCurrentScreenType, selectCurrentScreenData } from '../../hooks/useSelectors';
import { screenRegistry } from '../../screens/registry';
import { SkeletonScreen } from '../SkeletonScreen/SkeletonScreen';
import styles from './ScreenRenderer.module.css';

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

  return (
    <Suspense fallback={<SkeletonScreen />}>
      <div key={screenType} className={`${styles.wrapper} ${styles.screenEnter}`}>
        <Component data={screenData} actor={actor} />
      </div>
    </Suspense>
  );
}
