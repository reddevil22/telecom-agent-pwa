import { useState } from "react";
import type { ScreenData } from "../../types/agent";
import type { ScreenActor } from "../../types/screens";
import styles from "./SupportScreen.module.css";

const SUBJECT_MIN = 5;
const SUBJECT_MAX = 100;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 500;

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

export function SupportScreen({ data, actor }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [descriptionTouched, setDescriptionTouched] = useState(false);

  if (data.type !== "support") return null;
  const { tickets, faqItems } = data;

  function getSubjectError(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return subjectTouched ? "Subject is required." : null;
    if (trimmed.length < SUBJECT_MIN)
      return `Subject must be at least ${SUBJECT_MIN} characters.`;
    if (trimmed.length > SUBJECT_MAX)
      return `Subject must be at most ${SUBJECT_MAX} characters.`;
    return null;
  }

  function getDescriptionError(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return descriptionTouched ? "Description is required." : null;
    if (trimmed.length < DESCRIPTION_MIN)
      return `Description must be at least ${DESCRIPTION_MIN} characters.`;
    if (trimmed.length > DESCRIPTION_MAX)
      return `Description must be at most ${DESCRIPTION_MAX} characters.`;
    return null;
  }

  const subjectError = getSubjectError(subject);
  const descriptionError = getDescriptionError(description);
  const isFormValid = !subjectError && !descriptionError;

  function handleSubmit() {
    setSubjectTouched(true);
    setDescriptionTouched(true);
    if (!isFormValid) return;

    actor.send({
      type: "SUBMIT_PROMPT",
      prompt: `Create a support ticket: ${subject}. ${description}`,
    });
    setSubject("");
    setDescription("");
    setSubjectTouched(false);
    setDescriptionTouched(false);
    setShowForm(false);
  }

  function toggleForm() {
    if (showForm) {
      setSubject("");
      setDescription("");
      setSubjectTouched(false);
      setDescriptionTouched(false);
    }
    setShowForm(!showForm);
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
                  <div className={styles.ticketMeta}>
                    {t.id} · {t.createdAt}
                  </div>
                </div>
                <span
                  className={`${styles.statusBadge} ${styles[`statusBadge--${t.status}`]}`}
                >
                  {t.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.headingRow}>
          <h3 className={styles.heading}>Frequently Asked</h3>
          <button className={styles.newTicketBtn} onClick={toggleForm}>
            {showForm ? "Cancel" : "+ New Ticket"}
          </button>
        </div>

        {showForm && (
          <div className={styles.ticketForm}>
            <input
              className={styles.formInput}
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => {
                setSubjectTouched(true);
                setSubject(e.target.value);
              }}
              aria-invalid={!!subjectError}
            />
            {subjectError && <p className={styles.errorText}>{subjectError}</p>}
            <textarea
              className={styles.formTextarea}
              placeholder="Describe your issue..."
              rows={3}
              value={description}
              onChange={(e) => {
                setDescriptionTouched(true);
                setDescription(e.target.value);
              }}
              aria-invalid={!!descriptionError}
            />
            {descriptionError && (
              <p className={styles.errorText}>{descriptionError}</p>
            )}
            <button
              className={styles.formSubmit}
              onClick={handleSubmit}
              disabled={!isFormValid}
            >
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
