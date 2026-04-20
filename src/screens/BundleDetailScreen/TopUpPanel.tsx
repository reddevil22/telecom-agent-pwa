import { useState } from "react";
import styles from "./TopUpPanel.module.css";

export type TopUpState = "showing_panel" | "topup_pending" | "topup_success" | "topup_failed";

export type TopUpOutcome =
  | { status: "success"; balance: number }
  | { status: "error"; error: string };

export interface TopUpPanelProps {
  currentBalance: number;
  bundlePrice: number;
  currency: string;
  topUpOutcome?: TopUpOutcome | null;
  onCancel: () => void;
  onTopUpRequest: (amount: number) => void;
  cheapestBundle?: { id: string; name: string; price: number };
}

const AMOUNT_PRESETS = [5, 10, 20, 50];

export function TopUpPanel({
  currentBalance,
  bundlePrice,
  currency,
  topUpOutcome,
  onCancel,
  onTopUpRequest,
  cheapestBundle,
}: TopUpPanelProps) {
  const [topUpState, setTopUpState] = useState<TopUpState>("showing_panel");
  const [errorMessage, setErrorMessage] = useState("");

  function handleTopUp(amount: number) {
    setTopUpState("topup_pending");
    setErrorMessage("");
    onTopUpRequest(amount);
  }

  const effectiveState: TopUpState =
    topUpOutcome?.status === "success"
      ? "topup_success"
      : topUpOutcome?.status === "error"
        ? "topup_failed"
        : topUpState;
  const effectiveBalance =
    topUpOutcome?.status === "success" ? topUpOutcome.balance : null;
  const effectiveErrorMessage =
    topUpOutcome?.status === "error"
      ? topUpOutcome.error || "Top-up failed"
      : errorMessage;

  if (effectiveState === "topup_success" && effectiveBalance !== null) {
    return (
      <div className={styles.panel} role="region" aria-label="Top up balance">
        <div className={styles.successBanner}>
          <span className={styles.icon}>✓</span>
          <span>Balance updated: {currency} {effectiveBalance.toFixed(2)}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel} role="region" aria-label="Top up balance">
      {effectiveState === "topup_pending" ? (
        <div className={styles.pendingBanner}>
          <span className={styles.spinner}>⏳</span>
          <span>Adding funds...</span>
        </div>
      ) : effectiveState === "topup_failed" ? (
        <div className={styles.errorBanner}>
          <div className={styles.errorHeader}>
            <span className={styles.icon}>⚠️</span>
            <span className={styles.errorTitle}>Top-up failed</span>
          </div>
          <p className={styles.errorMessage}>{effectiveErrorMessage}</p>
          <div className={styles.errorActions}>
            <button
              className={styles.retryBtn}
              onClick={() => {
                setErrorMessage("");
                setTopUpState("showing_panel");
              }}
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
