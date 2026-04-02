import { useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { orchestratorMachine } from '../../machines/orchestratorMachine';
import {
  selectConversationHistory,
  selectCurrentSuggestions,
  selectState,
} from '../../hooks/useSelectors';
import { ChatBubble } from '../ChatBubble/ChatBubble';
import { SuggestionChips } from '../SuggestionChips/SuggestionChips';
import styles from './PromptContainer.module.css';

type Actor = ActorRefFrom<typeof orchestratorMachine>;

interface Props {
  actor: Actor;
}

export function PromptContainer({ actor }: Props) {
  const [input, setInput] = useState('');
  const state = useSelector(actor, selectState);
  const conversationHistory = useSelector(actor, selectConversationHistory);
  const suggestions = useSelector(actor, selectCurrentSuggestions);
  const isProcessing = state === 'processing';

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isProcessing) return;
    actor.send({ type: 'SUBMIT_PROMPT', prompt: trimmed });
    setInput('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submit(input);
  }

  return (
    <div className={styles.container}>
      {conversationHistory.length > 0 && (
        <div className={styles.history}>
          {conversationHistory.map((msg, i) => (
            <ChatBubble key={i} message={msg} />
          ))}
        </div>
      )}

      <SuggestionChips suggestions={suggestions} onSelect={submit} />

      <form onSubmit={handleSubmit} className={styles.inputRow}>
        <input
          className={styles.input}
          type="text"
          placeholder="Ask me anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isProcessing}
        />
        <button className={styles.submitBtn} type="submit" disabled={isProcessing || !input.trim()}>
          &#x27A4;
        </button>
      </form>
    </div>
  );
}
