import { useState } from 'react';
import type { ScreenData } from '../../types/agent';
import type { ScreenActor } from '../../types/screens';
import styles from './BalanceScreen.module.css';

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

export function BalanceScreen({ data, actor }: Props) {
  if (data.type !== 'balance') return null;
  const { balance } = data;
  const [showTopUp, setShowTopUp] = useState(false);
  const [amount, setAmount] = useState('');

  function handleTopUp() {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return;
    actor.send({ type: 'SUBMIT_PROMPT', prompt: `Top up ${val} dollars` });
    setAmount('');
    setShowTopUp(false);
  }

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

      {showTopUp ? (
        <div className={styles.topUpRow}>
          <input
            className={styles.topUpInput}
            type="number"
            min="1"
            step="1"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTopUp()}
          />
          <button className={styles.topUpBtn} onClick={handleTopUp}>Add</button>
          <button className={styles.cancelBtn} onClick={() => { setShowTopUp(false); setAmount(''); }}>Cancel</button>
        </div>
      ) : (
        <button className={styles.topUpTrigger} onClick={() => setShowTopUp(true)}>
          + Top Up
        </button>
      )}
    </div>
  );
}
