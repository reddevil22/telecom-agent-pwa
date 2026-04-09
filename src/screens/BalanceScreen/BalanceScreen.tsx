import { useState } from 'react';
import type { ScreenData } from '../../types/agent';
import type { ScreenActor } from '../../types/screens';
import styles from './BalanceScreen.module.css';

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
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
    <div className={styles.balanceContainer}>
      <div className={styles.balanceRow}>
        <span className={styles.balanceAmount}>${balance.current.toFixed(2)}</span>
        <span className={styles.balanceNote}>auto-renews {formatDate(balance.nextBillingDate)}</span>
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
        <button className={styles.topUpLink} onClick={() => setShowTopUp(true)}>
          + Add funds
        </button>
      )}
    </div>
  );
}
