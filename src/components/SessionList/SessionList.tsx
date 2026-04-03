import { useState } from 'react';
import styles from './SessionList.module.css';

export interface SessionSummary {
  sessionId: string;
  messageCount: number;
  lastMessageAt: number;
}

interface Props {
  sessions: SessionSummary[];
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export function SessionList({ sessions, onSelectSession, onDeleteSession }: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <div className={styles.empty}>No previous sessions</div>;
  }

  const handleDeleteClick = (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setDeletingId(sessionId);
  };

  const handleConfirmDelete = (sessionId: string) => {
    onDeleteSession(sessionId);
    setDeletingId(null);
  };

  const handleCancelDelete = () => {
    setDeletingId(null);
  };

  return (
    <ul className={styles.list}>
      {sessions.map((session) => (
        <li key={session.sessionId} className={styles.item} data-testid="session-item">
          <button onClick={() => onSelectSession(session.sessionId)} className={styles.selectBtn}>
            <span className={styles.meta}>
              {session.messageCount} messages • {new Date(session.lastMessageAt).toLocaleDateString()}
            </span>
          </button>
          {deletingId === session.sessionId ? (
            <div className={styles.confirmActions}>
              <span className={styles.confirmText}>Delete?</span>
              <button
                onClick={() => handleConfirmDelete(session.sessionId)}
                className={styles.confirmYes}
              >
                Yes
              </button>
              <button
                onClick={handleCancelDelete}
                className={styles.confirmNo}
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => handleDeleteClick(session.sessionId, e)}
              className={styles.deleteBtn}
              data-testid="delete-session-button"
            >
              Delete
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
