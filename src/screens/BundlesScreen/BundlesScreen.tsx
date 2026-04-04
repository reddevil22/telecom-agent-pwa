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

  function handleViewDetails(bundleId: string) {
    actor.send({ type: 'SUBMIT_PROMPT', prompt: `Show me details for bundle ${bundleId}` });
  }

  // Separate featured (popular) from regular bundles
  const featured = bundles.find((b) => b.popular);
  const regular = bundles.filter((b) => !b.popular);

  return (
    <div className={styles.container}>
      {/* Featured bundle - hero treatment */}
      {featured && (
        <div className={styles.featured}>
          <div className={styles.featuredHeader}>
            <span className={styles.featuredLabel}>Recommended</span>
            <h3 className={styles.featuredName}>{featured.name}</h3>
            <p className={styles.featuredDesc}>{featured.description}</p>
          </div>
          <div className={styles.featuredBody}>
            <div className={styles.featuredPrice}>
              <span className={styles.priceAmount}>${featured.price.toFixed(2)}</span>
              <span className={styles.pricePeriod}>/ {featured.validity}</span>
            </div>
            <div className={styles.featuredMeta}>
              <span className={styles.metaItem}>
                <span className={styles.metaValue}>{featured.dataGB} GB</span>
                <span className={styles.metaLabel}>data</span>
              </span>
              <span className={styles.metaDivider}></span>
              <span className={styles.metaItem}>
                <span className={styles.metaValue}>
                  {featured.minutes === -1 ? '∞' : featured.minutes}
                </span>
                <span className={styles.metaLabel}>min</span>
              </span>
              <span className={styles.metaDivider}></span>
              <span className={styles.metaItem}>
                <span className={styles.metaValue}>
                  {featured.sms === -1 ? '∞' : featured.sms}
                </span>
                <span className={styles.metaLabel}>SMS</span>
              </span>
            </div>
            <button
              className={styles.buyBtnFeatured}
              onClick={() => handleViewDetails(featured.id)}
            >
              View Details
            </button>
          </div>
        </div>
      )}

      {/* Regular bundles - compact list */}
      {regular.length > 0 && (
        <div className={styles.regularList}>
          <span className={styles.sectionLabel}>Other options</span>
          {regular.map((b) => (
            <div key={b.id} className={styles.regularCard}>
              <div className={styles.regularInfo}>
                <span className={styles.regularName}>{b.name}</span>
                <span className={styles.regularDetails}>
                  {b.dataGB} GB · {b.minutes === -1 ? '∞ min' : `${b.minutes} min`} · {b.sms === -1 ? '∞ SMS' : `${b.sms} SMS`}
                </span>
              </div>
              <div className={styles.regularRight}>
                <span className={styles.regularPrice}>${b.price.toFixed(2)}</span>
                <span className={styles.regularPeriod}>/ {b.validity}</span>
              </div>
              <button
                className={styles.buyBtnCompact}
                onClick={() => handleViewDetails(b.id)}
              >
                Details
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
