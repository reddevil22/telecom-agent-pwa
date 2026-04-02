import type { ScreenData } from '../../types/agent';
import styles from './UsageScreen.module.css';

interface Props {
  data: ScreenData;
}

export function UsageScreen({ data }: Props) {
  if (data.type !== 'usage') return null;
  const { usage } = data;

  return (
    <div className={styles.list}>
      {usage.map((u) => {
        const pct = Math.min((u.used / u.total) * 100, 100);
        return (
          <div key={u.type} className={styles.card}>
            <div className={styles.header}>
              <span className={styles.type}>{u.type}</span>
              <span className={styles.period}>{u.period}</span>
            </div>
            <div className={styles.barTrack}>
              <div className={styles.barFill} style={{ width: `${pct}%` }} />
            </div>
            <div className={styles.values}>
              <span className={styles.valuesMain}>
                <strong>{u.used}</strong> / {u.total} {u.unit}
              </span>
              <span className={styles.valuesPercent}>{Math.round(pct)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
