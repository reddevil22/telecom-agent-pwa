import styles from './DegradedBanner.module.css';

export function DegradedBanner() {
  return (
    <div className={styles.banner} role="alert" data-testid="degraded-banner">
      <span className={styles.icon}>⚠</span>
      <span className={styles.text}>
        AI chat is temporarily unavailable. Use quick actions below or try again shortly.
      </span>
    </div>
  );
}
