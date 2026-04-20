import { useState } from "react";
import styles from "./TopUpPanel.module.css";

export type TopUpState = "showing_panel" | "topup_pending" | "topup_success" | "topup_failed";

export interface TopUpPanelProps {
  currentBalance: number;
  bundlePrice: number;
  currency: string;
  onTopUpSuccess: (newBalance: number) => void;
  onTopUpError: (error: string) => void;
  onCancel: () => void;
  onTopUpRequest: (amount: number) => void;
  cheapestBundle?: { id: string; name: string; price: number };
}

const AMOUNT_PRESETS = [5, 10, 20, 50];

export function TopUpPanel({
  currentBalance,
  bundlePrice,
  currency,
  onTopUpSuccess,
  onTopUpError,
  onCancel,
  onTopUpRequest,
  cheapestBundle,
}: TopUpPanelProps) {
  const [topUpState, setTopUpState] = useState<TopUpState>("showing_panel");
  const [errorMessage, setErrorMessage] = useState("");
  const [updatedBalance, setUpdatedBalance] = useState<number | null>(null);

  function handleTopUp(amount: number) {
    setTopUpState("topup_pending");
    setErrorMessage("");
    onTopUpRequest(amount);
  }

  // Called by parent via window.__topUpPanel.handleResponseSuccess(newBalance)
  function handleResponseSuccess(newBalance: number) {
    setUpdatedBalance(newBalance);
    onTopUpSuccess(newBalance);
    setTopUpState("topup_success");
  }

  // Called by parent via window.__topUpPanel.handleResponseError(error)
  function handleResponseError(error: string) {
    const msg = error || "Top-up failed";
    setErrorMessage(msg);
    onTopUpError(msg);
    setTopUpState("topup_failed");
  }

  // Expose API for parent to call back after machine processes the response
  if (typeof window !== "undefined") {
    (window as unknown as { __topUpPanel: unknown }).__topUpPanel = {
      handleResponseSuccess,
      handleResponseError,
    };
  }

  if (topUpState === "topup_success" && updatedBalance !== null) {
    return (
      <div className={styles.panel} role="region" aria-label="Top up balance">
        <div className={styles.successBanner}>
          <span className={styles.icon}>✓</span>
          <span>Balance updated: {currency} {updatedBalance.toFixed(2)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel} role="region" aria-label="Top up balance">
      {topUpState === "topup_pending" ? (
        <div className={styles.pendingBanner}>
          <span className={styles.spinner}>⏳</span>
          <span>Adding funds...</span>
        </div>
      ) : topUpState === "topup_failed" ? (
        <div className={styles.errorBanner}>
          <div className={styles.errorHeader}>
            <span className={styles.icon}>⚠️</span>
            <span className={styles.errorTitle}>Top-up failed</span>
          </div>
          <p className={styles.errorMessage}>{errorMessage}</p>
          <div className={styles.errorActions}>
            <button
              className={styles.retryBtn}
              onClick={() => setTopUpState("showing_panel")}
            >
              Try again
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.header}>
            <span className={styles.icon}>💳</span>
            <span className={styles.title}>Insufficient balance</span>
          </div>
          <p className={styles.message}>
            You have {currency} {currentBalance.toFixed(2)} — needs{" "}
            {currency} {bundlePrice.toFixed(2)}
          </p>
          <p className={styles.label}>Quick top-up:</p>
          <div className={styles.amounts}>
            {AMOUNT_PRESETS.map((amount) => (
              <button
                key={amount}
                className={styles.amountBtn}
                onClick={() => handleTopUp(amount)}
              >
                +${amount}
              </button>
            ))}
          </div>
          <p className={styles.hint}>After top-up, complete purchase</p>

          {cheapestBundle && (
            <div className={styles.cheapestSuggestion}>
              <p className={styles.cheapestLabel}>Least expensive option:</p>
              <button
                className={styles.cheapestBtn}
                onClick={() => {
                  onCancel();
                }}
              >
                {cheapestBundle.name} — {currency}{" "}
                {cheapestBundle.price.toFixed(2)}
              </button>
            </div>
          )}

          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
