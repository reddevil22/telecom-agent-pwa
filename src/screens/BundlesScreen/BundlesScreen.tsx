import type { ScreenData } from '../../types/agent';
import type { ScreenActor } from '../../types/screens';
import styles from './BundlesScreen.module.css';

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

export function BundlesScreen({ data, actor }: Props) {
  if (data.type !== 'bundles') return null;
  const { bundles } = data;

  function handleBuy(_bundleId: string, bundleName: string) {
    actor.send({ type: 'SUBMIT_PROMPT', prompt: `Buy the ${bundleName} bundle` });
  }

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
          <button
            className={styles.buyBtn}
            onClick={() => handleBuy(b.id, b.name)}
          >
            Buy {b.name}
          </button>
        </div>
      ))}
    </div>
  );
}
