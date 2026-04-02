import type { ConversationMessage } from '../../types';
import styles from './ChatBubble.module.css';

interface Props {
  message: ConversationMessage;
}

export function ChatBubble({ message }: Props) {
  return (
    <div className={`${styles.bubble} ${styles[`bubble--${message.role}`]}`}>
      {message.text}
    </div>
  );
}
