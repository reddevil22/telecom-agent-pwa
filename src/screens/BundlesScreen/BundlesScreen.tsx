import type { ScreenData } from '../../types/agent';
import styles from './BundlesScreen.module.css';

interface Props {
  data: ScreenData;
}

export function BundlesScreen({ data }: Props) {
  if (data.type !== 'bundles') return null;
  const { bundles } = data;

  return (
    <div className={styles.list}>
      {bundles.map((b) => (
        <div
          key={b.id}
          className={`${styles.card} ${b.popular ? styles['card--popular'] : ''}`}
        >
          {b.popular && <span className={styles.badge}>Popular</span>}
          <div className={styles.name}>{b.name}</div>
          <div className={styles.desc}>{b.description}</div>
          <div className={styles.price}>
            ${b.price.toFixed(2)}
            <span> / {b.validity}</span>
          </div>
          <div className={styles.features}>
            <span className={styles.feature}>
              <span className={styles.featureIcon}>&#9650;</span>
              {b.dataGB} GB
            </span>
            <span className={styles.feature}>
              <span className={styles.featureIcon}>&#9742;</span>
              {b.minutes === -1 ? 'Unlimited' : `${b.minutes} min`}
            </span>
            <span className={styles.feature}>
              <span className={styles.featureIcon}>&#9993;</span>
              {b.sms === -1 ? 'Unlimited' : `${b.sms} SMS`}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
