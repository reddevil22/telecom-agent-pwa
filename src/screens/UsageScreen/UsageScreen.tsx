import type { ScreenData } from '../../types/agent';
import type { ScreenActor } from '../../types/screens';
import styles from './UsageScreen.module.css';

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

export function UsageScreen({ data }: Props) {
  if (data.type !== 'usage') return null;
  const { usage } = data;

  return (
    <div className={styles.list}>
      {usage.map((u) => {
        const rawPct = u.total > 0 ? (u.used / u.total) * 100 : 0;
        const displayPct = Math.min(rawPct, 100);
        const isOverLimit = rawPct > 100;
        return (
          <div key={u.type} className={styles.card}>
            <div className={styles.header}>
              <span className={styles.type}>{u.type}</span>
              <span className={styles.period}>{u.period}</span>
            </div>
            <div className={styles.barTrack}>
              <div
                className={`${styles.barFill}${isOverLimit ? ' ' + styles.overLimit : ''}`}
                style={{ width: `${displayPct}%` }}
              />
            </div>
            <div className={styles.values}>
              <span className={styles.valuesMain}>
                <strong>{u.used}</strong> / {u.total} {u.unit}
              </span>
              <span className={`${styles.valuesPercent}${isOverLimit ? ' ' + styles.overLimit : ''}`}>
                {Math.round(rawPct)}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
