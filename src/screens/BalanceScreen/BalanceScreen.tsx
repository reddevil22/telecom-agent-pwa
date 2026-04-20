import { useEffect, useState } from "react";
import type { ScreenData } from "../../types/agent";
import type { ScreenActor } from "../../types/screens";
import styles from "./BalanceScreen.module.css";

const MIN_TOP_UP = 1;
const MAX_TOP_UP = 500;

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function BalanceScreen({ data, actor }: Props) {
  const [showTopUp, setShowTopUp] = useState(false);
  const [amount, setAmount] = useState("");
  const [debouncedAmount, setDebouncedAmount] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedAmount(amount);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [amount]);

  if (data.type !== "balance") return null;
  const { balance } = data;

  function getAmountError(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) {
      return touched ? "Enter an amount between $1 and $500." : null;
    }

    const parsed = Number.parseFloat(trimmed);
    if (Number.isNaN(parsed)) {
      return "Amount must be a number.";
    }

    if (parsed < MIN_TOP_UP || parsed > MAX_TOP_UP) {
      return `Amount must be between $${MIN_TOP_UP} and $${MAX_TOP_UP}.`;
    }

    return null;
  }

  const amountError = getAmountError(debouncedAmount);
  const isAmountValid = !amountError;

  function handleTopUp() {
    if (!isAmountValid) return;

    const val = parseFloat(debouncedAmount);
    if (isNaN(val)) return;

    actor.send({ type: "SUBMIT_PROMPT", prompt: `Top up ${val} dollars` });
    setAmount("");
    setDebouncedAmount("");
    setTouched(false);
    setShowTopUp(false);
  }

  return (
    <div data-testid="balance-screen" className={styles.balanceContainer}>
      <div className={styles.balanceRow}>
        <span className={styles.balanceAmount}>
          ${balance.current.toFixed(2)}
        </span>
        <span className={styles.balanceNote}>
          auto-renews {formatDate(balance.nextBillingDate)}
        </span>
      </div>

      {showTopUp ? (
        <>
          <div className={styles.topUpRow}>
            <input
              className={styles.topUpInput}
              type="number"
              min={MIN_TOP_UP}
              max={MAX_TOP_UP}
              step="1"
              placeholder="Amount"
              value={amount}
              onChange={(e) => {
                setTouched(true);
                setAmount(e.target.value);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleTopUp()}
              aria-invalid={!!amountError}
            />
            <button
              className={styles.topUpBtn}
              onClick={handleTopUp}
              disabled={!isAmountValid}
            >
              Add
            </button>
            <button
              className={styles.cancelBtn}
              onClick={() => {
                setShowTopUp(false);
                setAmount("");
                setDebouncedAmount("");
                setTouched(false);
              }}
            >
              Cancel
            </button>
          </div>
          {amountError && <p className={styles.errorText}>{amountError}</p>}
        </>
      ) : (
        <button className={styles.topUpLink} onClick={() => setShowTopUp(true)}>
          + Add funds
        </button>
      )}
    </div>
  );
}
