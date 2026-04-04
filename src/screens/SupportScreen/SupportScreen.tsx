import { useState } from 'react';
import type { ScreenData } from '../../types/agent';
import type { ScreenActor } from '../../types/screens';
import styles from './SupportScreen.module.css';

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

export function SupportScreen({ data, actor }: Props) {
  if (data.type !== 'support') return null;
  const { tickets, faqItems } = data;
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');

  function handleSubmit() {
    if (!subject.trim()) return;
    actor.send({ type: 'SUBMIT_PROMPT', prompt: `Create a support ticket: ${subject}. ${description}` });
    setSubject('');
    setDescription('');
    setShowForm(false);
  }

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
        <div className={styles.headingRow}>
          <h3 className={styles.heading}>Frequently Asked</h3>
          <button className={styles.newTicketBtn} onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : '+ New Ticket'}
          </button>
        </div>

        {showForm && (
          <div className={styles.ticketForm}>
            <input
              className={styles.formInput}
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <textarea
              className={styles.formTextarea}
              placeholder="Describe your issue..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <button className={styles.formSubmit} onClick={handleSubmit} disabled={!subject.trim()}>
              Submit Ticket
            </button>
          </div>
        )}

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
