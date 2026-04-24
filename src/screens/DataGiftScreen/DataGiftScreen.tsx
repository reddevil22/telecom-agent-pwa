import type { ScreenData } from "../../types/agent";
import type { ScreenActor } from "../../types/screens";
import styles from "./DataGiftScreen.module.css";

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

export function DataGiftScreen({ data, actor }: Props) {
  const screen = data.type === "dataGift" ? data : null;
  if (!screen) return null;

  const isPending = screen.status === "pending";
  const isSuccess = screen.status === "success";

  function handleConfirm() {
    if (!screen?.confirmationToken) return;
    actor.send({
      type: "SUBMIT_PROMPT",
      prompt: "Confirm request",
      confirmationAction: {
        token: screen.confirmationToken,
        decision: "confirm",
      },
    });
  }

  function handleCancel() {
    if (!screen?.confirmationToken) return;
    actor.send({
      type: "SUBMIT_PROMPT",
      prompt: "Cancel request",
      confirmationAction: {
        token: screen.confirmationToken,
        decision: "cancel",
      },
    });
  }

  return (
    <div
      className={`${styles.card} ${isPending ? styles.pending : isSuccess ? styles.success : styles.error}`}
    >
      <div className={styles.header}>
        <span className={styles.icon}>
          {isPending ? "?" : isSuccess ? "\u2713" : "\u2717"}
        </span>
        <h3 className={styles.title}>{screen.title}</h3>
      </div>
      <p className={styles.message}>{screen.message}</p>

      <div className={styles.details}>
        <DetailRow label="Recipient" value={screen.details.recipientName} />
        {screen.details.recipientMsisdn && (
          <DetailRow label="Phone" value={screen.details.recipientMsisdn} />
        )}
        <DetailRow label="Amount" value={formatMb(screen.details.amountMb)} />
        {screen.details.sourceBundleName && (
          <DetailRow label="From Bundle" value={screen.details.sourceBundleName} />
        )}
        {screen.details.remainingMb > 0 && (
          <DetailRow
            label="Remaining After"
            value={formatMb(screen.details.remainingMb)}
          />
        )}
      </div>

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

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailValue}>{String(value)}</span>
    </div>
  );
}

function formatMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}
