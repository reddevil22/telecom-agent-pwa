import type { ScreenData } from "../../types/agent";
import type { ScreenActor } from "../../types/screens";
import { TopUpPanel } from "./TopUpPanel";
import styles from "./BundleDetailScreen.module.css";

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

export function BundleDetailScreen({ data, actor }: Props) {
  if (data.type !== "bundleDetail") return null;

  const { bundle, currentBalance } = data;
  const balanceAfter = currentBalance.current - bundle.price;
  const hasInsufficientBalance = balanceAfter < 0;

  function handleConfirm() {
    if (hasInsufficientBalance) return;
    actor.send({
      type: "SUBMIT_PROMPT",
      prompt: `Confirm purchase bundle ${bundle.id}. Use bundle ID ${bundle.id}.`,
    });
  }

  function handleCancel() {
    actor.send({ type: "SUBMIT_PROMPT", prompt: "List all available bundles" });
  }

  function handleTopUpRequest(amount: number) {
    actor.send({
      type: "SUBMIT_PROMPT",
      prompt: `top up $${amount}`,
    });
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          {bundle.popular && <span className={styles.badge}>Recommended</span>}
          <h3 className={styles.name}>{bundle.name}</h3>
          <p className={styles.description}>{bundle.description}</p>
        </div>

        <div className={styles.priceSection}>
          <span className={styles.price}>
            {bundle.currency} {bundle.price.toFixed(2)}
          </span>
          <span className={styles.period}>/ {bundle.validity}</span>
        </div>

        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureValue}>{bundle.dataGB} GB</span>
            <span className={styles.featureLabel}>Data</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureValue}>
              {bundle.minutes === -1 ? "∞" : bundle.minutes}
            </span>
            <span className={styles.featureLabel}>Minutes</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureValue}>
              {bundle.sms === -1 ? "∞" : bundle.sms}
            </span>
            <span className={styles.featureLabel}>SMS</span>
          </div>
        </div>

        <div className={styles.balanceCheck}>
          <div className={styles.balanceRow}>
            <span className={styles.balanceLabel}>Current Balance</span>
            <span className={styles.balanceValue}>
              {currentBalance.currency} {currentBalance.current.toFixed(2)}
            </span>
          </div>
          <div className={styles.balanceAfter}>
            <span className={styles.balanceAfterLabel}>
              Balance After Purchase
            </span>
            <span
              className={`${styles.balanceAfterValue} ${hasInsufficientBalance ? styles.insufficient : ""}`}
            >
              {currentBalance.currency} {balanceAfter.toFixed(2)}
            </span>
          </div>
          {hasInsufficientBalance && (
            <div className={styles.warning}>
              <span className={styles.warningIcon}>⚠️</span>
              <span className={styles.warningText}>
                Insufficient balance. Please top up first.
              </span>
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={hasInsufficientBalance}
            aria-label={
              hasInsufficientBalance
                ? "Insufficient balance to purchase"
                : `Confirm purchase of ${bundle.name}`
            }
          >
            {hasInsufficientBalance
              ? "Insufficient Balance"
              : "Confirm Purchase"}
          </button>
          <button
            className={styles.cancelBtn}
            onClick={handleCancel}
            aria-label="Cancel and go back to bundles"
          >
            Cancel
          </button>
        </div>

        {hasInsufficientBalance && (
          <TopUpPanel
            currentBalance={currentBalance.current}
            bundlePrice={bundle.price}
            currency={currentBalance.currency}
            onCancel={handleCancel}
            onTopUpRequest={handleTopUpRequest}
            cheapestBundle={undefined}
          />
        )}
      </div>
    </div>
  );
}
