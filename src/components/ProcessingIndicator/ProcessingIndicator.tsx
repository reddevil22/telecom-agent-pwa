import type { ProcessingStep } from '../../types/agent';
import styles from './ProcessingIndicator.module.css';

interface Props {
  steps: ProcessingStep[];
}

export function ProcessingIndicator({ steps }: Props) {
  // If we have steps, show the step list (no typing dots/wave - they're redundant with real steps)
  if (steps.length > 0) {
    return (
      <div className={styles.indicator}>
        <div className={styles.steps}>
          {steps.map((step, i) => (
            <div
              key={`${step.label}-${i}`}
              className={`${styles.step} ${styles[`step--${step.status}`]}`}
            >
              <span className={styles.stepIcon}>
                {step.status === 'active' && <span className={styles.stepSpinner} />}
                {step.status === 'done' && <span className={styles.stepCheck}>✓</span>}
                {step.status === 'error' && <span className={styles.stepX}>✕</span>}
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
    <div className={styles.indicator}>
      <div className={styles.spinner} />
    </div>
  );
}
