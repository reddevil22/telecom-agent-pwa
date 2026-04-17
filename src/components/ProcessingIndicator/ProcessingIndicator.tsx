import type { ProcessingStep } from "../../types/agent";
import styles from "./ProcessingIndicator.module.css";

interface Props {
  steps: ProcessingStep[];
}

function toStatusLabel(status: ProcessingStep["status"]): string {
  if (status === "active") return "in progress";
  if (status === "done") return "complete";
  if (status === "error") return "failed";
  return "pending";
}

export function ProcessingIndicator({ steps }: Props) {
  // If we have steps, show the step list (no typing dots/wave - they're redundant with real steps)
  if (steps.length > 0) {
    const activeIndex = steps.findIndex((step) => step.status === "active");
    const currentIndex =
      activeIndex >= 0 ? activeIndex : Math.max(steps.length - 1, 0);
    const currentStep = steps[currentIndex];
    const summary = `Step ${currentIndex + 1} of ${steps.length}: ${currentStep.label} (${toStatusLabel(currentStep.status)})`;

    return (
      <div
        className={styles.indicator}
        role="status"
        aria-live="polite"
        aria-label="Processing your request"
      >
        <span className={styles.srOnly}>{summary}</span>
        <div className={styles.steps}>
          {steps.map((step, i) => (
            <div
              key={`${step.label}-${i}`}
              className={`${styles.step} ${styles[`step--${step.status}`]}`}
              aria-label={`${step.label}: ${toStatusLabel(step.status)}`}
            >
              <span className={styles.stepIcon}>
                {step.status === "active" && (
                  <span className={styles.stepSpinner} />
                )}
                {step.status === "done" && (
                  <span className={styles.stepCheck}>✓</span>
                )}
                {step.status === "error" && (
                  <span className={styles.stepX}>✕</span>
                )}
              </span>
              <span className={styles.stepLabel}>{step.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback to spinner if no steps
  return (
    <div
      className={styles.indicator}
      role="status"
      aria-live="polite"
      aria-label="Processing your request"
    >
      <span className={styles.srOnly}>Processing your request</span>
      <div className={styles.spinner} />
    </div>
  );
}
