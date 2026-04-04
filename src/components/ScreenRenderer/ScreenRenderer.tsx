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

  // Don't show supplementary results when main screen is confirmation
  // The confirmation screen already displays all relevant info (balance, etc.)
  const showSupplementary = screenType !== 'confirmation' && supplementaryResults && supplementaryResults.length > 0;

  const supplementaryScreens = showSupplementary
    ? supplementaryResults
        .map((result) => {
          const supEntry = screenRegistry.get(result.screenType);
          if (!supEntry) return null;
          const SupComponent = supEntry.component;
          return <SupComponent key={result.toolName} data={result.screenData} actor={actor} />;
        })
        .filter(Boolean)
    : [];

  return (
    <>
      <Component data={screenData} actor={actor} />
      {supplementaryScreens.length > 0 && (
        <div className="supplementary-results">{supplementaryScreens}</div>
      )}
    </>
  );
}
