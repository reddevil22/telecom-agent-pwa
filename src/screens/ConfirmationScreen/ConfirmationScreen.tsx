import type { ScreenData } from '../../types/agent';
import type { ScreenActor } from '../../types/screens';
import styles from './ConfirmationScreen.module.css';

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

export function ConfirmationScreen({ data, actor }: Props) {
  const confirmationData = data.type === 'confirmation' ? data : null;
  if (!confirmationData) return null;
  const screen = confirmationData;

  const isPending = screen.status === 'pending';
  const isSuccess = screen.status === 'success';

  function handleConfirm() {
    if (!screen.confirmationToken) return;
    actor.send({
      type: 'SUBMIT_PROMPT',
      prompt: 'Confirm request',
      confirmationAction: {
        token: screen.confirmationToken,
        decision: 'confirm',
      },
    });
  }

  function handleCancel() {
    if (!screen.confirmationToken) return;
    actor.send({
      type: 'SUBMIT_PROMPT',
      prompt: 'Cancel request',
      confirmationAction: {
        token: screen.confirmationToken,
        decision: 'cancel',
      },
    });
  }

  return (
    <div
      className={`${styles.card} ${isPending ? styles.pending : isSuccess ? styles.success : styles.error}`}
    >
      <div className={styles.header}>
        <span className={styles.icon}>
          {isPending ? '?' : isSuccess ? '\u2713' : '\u2717'}
        </span>
        <h3 className={styles.title}>{screen.title}</h3>
      </div>
      <p className={styles.message}>{screen.message}</p>

      {Object.keys(screen.details).length > 0 && (
        <div className={styles.details}>
          {Object.entries(screen.details).map(([key, value]) => (
            <div key={key} className={styles.detailRow}>
              <span className={styles.detailLabel}>{formatLabel(key)}</span>
              <span className={styles.detailValue}>{String(value)}</span>
            </div>
          ))}
        </div>
      )}

      {screen.updatedBalance && (
        <div className={styles.balanceCard}>
          <span className={styles.balanceLabel}>Updated Balance</span>
          <span className={styles.balanceAmount}>
            {screen.updatedBalance.currency} {screen.updatedBalance.current.toFixed(2)}
          </span>
        </div>
      )}

      {isPending && screen.requiresUserConfirmation && screen.confirmationToken && (
        <div className={styles.actions}>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            aria-label="Confirm request"
          >
            Confirm
          </button>
          <button
            className={styles.cancelBtn}
            onClick={handleCancel}
            aria-label="Cancel request"
          >
            Cancel
          </button>
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
