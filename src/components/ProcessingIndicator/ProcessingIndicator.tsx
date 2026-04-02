import type { ProcessingStep } from '../../types/agent';
import styles from './ProcessingIndicator.module.css';

interface Props {
  steps: ProcessingStep[];
}

export function ProcessingIndicator({ steps }: Props) {
  return (
    <div className={styles.indicator}>
      <div className={styles.spinner} />
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
