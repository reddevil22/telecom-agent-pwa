import type { ScreenData } from '../../types/agent';
import type { ScreenActor } from '../../types/screens';
import styles from './ConfirmationScreen.module.css';

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

export function ConfirmationScreen({ data }: Props) {
  if (data.type !== 'confirmation') return null;

  const isSuccess = data.status === 'success';

  return (
    <div className={`${styles.card} ${isSuccess ? styles.success : styles.error}`}>
      <div className={styles.header}>
        <span className={styles.icon}>{isSuccess ? '\u2713' : '\u2717'}</span>
        <h3 className={styles.title}>{data.title}</h3>
      </div>
      <p className={styles.message}>{data.message}</p>

      {Object.keys(data.details).length > 0 && (
        <div className={styles.details}>
          {Object.entries(data.details).map(([key, value]) => (
            <div key={key} className={styles.detailRow}>
              <span className={styles.detailLabel}>{formatLabel(key)}</span>
              <span className={styles.detailValue}>{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      {data.updatedBalance && (
        <div className={styles.balanceCard}>
          <span className={styles.balanceLabel}>Updated Balance</span>
          <span className={styles.balanceAmount}>
            {data.updatedBalance.currency} {data.updatedBalance.current.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, s => s.toUpperCase())
    .trim();
}
