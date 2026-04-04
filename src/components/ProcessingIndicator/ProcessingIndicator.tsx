import type { ProcessingStep } from '../../types/agent';
import styles from './ProcessingIndicator.module.css';

interface Props {
  steps: ProcessingStep[];
}

export function ProcessingIndicator({ steps }: Props) {
  // If we have steps, show the step list with typing dots
  if (steps.length > 0) {
    return (
      <div className={styles.indicator}>
        <div className={styles.typingDots}>
          <div className={styles.typingDot}></div>
          <div className={styles.typingDot}></div>
          <div className={styles.typingDot}></div>
        </div>
        <div className={styles.signalWave}>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div className={styles.steps}>
          {steps.map((step) => (
            <div
              key={step.label}
              className={`${styles.step} ${styles[`step--${step.status}`]}`}
            >
              <span className={styles.stepDot} />
              {step.label}
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
