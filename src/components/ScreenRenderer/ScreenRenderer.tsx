import { Suspense } from "react";
import { useSelector } from "@xstate/react";
import type { ActorRefFrom } from "xstate";
import type { orchestratorMachine } from "../../machines/orchestratorMachine";
import {
  selectCurrentScreenType,
  selectCurrentScreenData,
  selectSupplementaryResults,
} from "../../hooks/useSelectors";
import { screenRegistry } from "../../screens/registry";
import { SkeletonScreen } from "../SkeletonScreen/SkeletonScreen";
import type { ToolResult, ScreenData } from "../../types/agent";
import styles from "./ScreenRenderer.module.css";

type Actor = ActorRefFrom<typeof orchestratorMachine>;

interface Props {
  actor: Actor;
}

export function ScreenRenderer({ actor }: Props) {
  const screenType = useSelector(actor, selectCurrentScreenType as any) as string | null;
  const screenData = useSelector(actor, selectCurrentScreenData as any) as ScreenData | null;
  const supplementaryResults = useSelector(actor, selectSupplementaryResults as any) as ToolResult[];

  if (!screenType || !screenData) return null;
  const entry = screenRegistry.get(screenType);
  if (!entry) return null;
  const Component = entry.component;

  return (
    <Suspense fallback={<SkeletonScreen />}>
      <div
        key={screenType}
        className={`${styles.wrapper} ${styles.screenEnter}`}
      >
        <div className={styles.primaryScreen}>
          <Component data={screenData} actor={actor} />
        </div>
        {supplementaryResults.length > 0 && (
          <SupplementaryResults
            results={supplementaryResults}
            actor={actor}
          />
        )}
      </div>
    </Suspense>
  );
}

function SupplementaryResults({
  results,
  actor,
}: {
  results: ToolResult[];
  actor: Actor;
}) {
  const hasBundleDetails = results.some(
    (r) => r.screenType === "bundleDetail",
  );

  if (hasBundleDetails) {
    return (
      <div className={styles.comparisonContainer}>
        <div className={styles.comparisonDivider}>
          <span className={styles.comparisonLabel}>Comparing</span>
        </div>
        <div className={styles.comparisonGrid}>
          {results.map((result, i) => {
            const entry = screenRegistry.get(result.screenType);
            if (!entry) return null;
            const Component = entry.component;
            return (
              <div key={i} className={styles.comparisonCard}>
                <Component
                  data={result.screenData as ScreenData}
                  actor={actor}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.supplementaryList}>
      <div className={styles.supplementaryDivider} />
      {results.map((result, i) => {
        const entry = screenRegistry.get(result.screenType);
        if (!entry) return null;
        const Component = entry.component;
        return (
          <div key={i} className={styles.supplementaryItem}>
            <Component data={result.screenData as ScreenData} actor={actor} />
          </div>
        );
      })}
    </div>
  );
}
