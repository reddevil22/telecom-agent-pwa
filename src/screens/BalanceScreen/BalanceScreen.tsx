import type { ScreenData } from '../../types/agent';
import styles from './BalanceScreen.module.css';

interface Props {
  data: ScreenData;
}

export function BalanceScreen({ data }: Props) {
  if (data.type !== 'balance') return null;
  const { balance } = data;

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.label}>Current Balance</div>
          <div className={styles.balance}>
            <span className={styles.amount}>${balance.current.toFixed(2)}</span>
            <span className={styles.currency}>{balance.currency}</span>
          </div>
        </div>
        <span className={styles.statusBadge}>Active</span>
      </div>
      <div className={styles.meta}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Last Top-up</span>
          <span className={styles.metaValue}>{balance.lastTopUp}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Next Billing</span>
          <span className={styles.metaValue}>{balance.nextBillingDate}</span>
        </div>
      </div>
    </div>
  );
}
