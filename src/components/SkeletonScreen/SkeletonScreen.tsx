import styles from './SkeletonScreen.module.css';

export function SkeletonScreen() {
  return (
    <div className={styles.container}>
      <div className={styles.bubble}>
        <div className={styles.avatar} />
        <div className={styles.lines}>
          <div className={styles.line} style={{ width: '60%' }} />
          <div className={styles.line} style={{ width: '80%' }} />
        </div>
      </div>
      <div className={styles.card}>
        <div className={styles.cardHeader} />
        <div className={styles.cardBody}>
          <div className={styles.bar} />
          <div className={styles.barShort} />
        </div>
      </div>
    </div>
  );
}
