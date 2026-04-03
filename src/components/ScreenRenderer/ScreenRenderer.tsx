import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { orchestratorMachine } from '../../machines/orchestratorMachine';
import { selectCurrentScreenType, selectCurrentScreenData, selectSupplementaryResults } from '../../hooks/useSelectors';
import { screenRegistry } from '../../screens/registry';

type Actor = ActorRefFrom<typeof orchestratorMachine>;

interface Props {
  actor: Actor;
}

export function ScreenRenderer({ actor }: Props) {
  const screenType = useSelector(actor, selectCurrentScreenType);
  const screenData = useSelector(actor, selectCurrentScreenData);
  const supplementaryResults = useSelector(actor, selectSupplementaryResults);

  if (!screenType || !screenData) return null;

  const entry = screenRegistry.get(screenType);
  if (!entry) return null;

  const Component = entry.component;

  const supplementaryScreens = supplementaryResults
    ?.map((result) => {
      const supEntry = screenRegistry.get(result.screenType);
      if (!supEntry) return null;
      const SupComponent = supEntry.component;
      return <SupComponent key={result.toolName} data={result.screenData} />;
    })
    .filter(Boolean);

  return (
    <>
      <Component data={screenData} />
      {supplementaryScreens && supplementaryScreens.length > 0 && (
        <div className="supplementary-results">{supplementaryScreens}</div>
      )}
    </>
  );
}
