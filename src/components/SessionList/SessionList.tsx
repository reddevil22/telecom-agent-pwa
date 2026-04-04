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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
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
              {session.messageCount} messages • {formatDate(session.lastMessageAt)}
            </span>
          </button>
          {deletingId === session.sessionId ? (
            <div className={styles.confirmActions}>
              <span className={styles.confirmText}>Delete this conversation?</span>
              <button
                onClick={() => handleConfirmDelete(session.sessionId)}
                className={styles.confirmYes}
              >
                Delete
              </button>
              <button
                onClick={handleCancelDelete}
                className={styles.confirmNo}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => handleDeleteClick(session.sessionId, e)}
              className={styles.deleteBtn}
              data-testid="delete-session-button"
              aria-label="Delete conversation"
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
