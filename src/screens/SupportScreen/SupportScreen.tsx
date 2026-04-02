import type { ScreenData } from '../../types/agent';
import styles from './SupportScreen.module.css';

interface Props {
  data: ScreenData;
}

export function SupportScreen({ data }: Props) {
  if (data.type !== 'support') return null;
  const { tickets, faqItems } = data;

  return (
    <div className={styles.container}>
      {tickets.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.heading}>Your Tickets</h3>
          <div className={styles.tickets}>
            {tickets.map((t) => (
              <div key={t.id} className={styles.ticket}>
                <div className={styles.ticketInfo}>
                  <div className={styles.ticketSubject}>{t.subject}</div>
                  <div className={styles.ticketMeta}>{t.id} · {t.createdAt}</div>
                </div>
                <span className={`${styles.statusBadge} ${styles[`statusBadge--${t.status}`]}`}>
                  {t.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <h3 className={styles.heading}>Frequently Asked</h3>
        <div className={styles.faqList}>
          {faqItems.map((faq) => (
            <div key={faq.question} className={styles.faqItem}>
              <div className={styles.faqQ}>{faq.question}</div>
              <div className={styles.faqA}>{faq.answer}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
