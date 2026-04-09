import { useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { RefObject } from 'react';
import type { orchestratorMachine } from '../../machines/orchestratorMachine';
import { selectCurrentSuggestions, selectState } from '../../hooks/useSelectors';
import { SuggestionChips } from '../SuggestionChips/SuggestionChips';
import styles from './PromptContainer.module.css';

type Actor = ActorRefFrom<typeof orchestratorMachine>;

interface Props {
  actor: Actor;
  inputRef?: RefObject<HTMLInputElement | null>;
}

export function PromptContainer({ actor, inputRef }: Props) {
  const [input, setInput] = useState('');
  const state = useSelector(actor, selectState);
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
      <SuggestionChips suggestions={suggestions} onSelect={submit} />
      <form onSubmit={handleSubmit} className={styles.inputRow}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          placeholder="Ask about balance, bundles, usage, or support"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isProcessing}
          aria-label="Type your message"
        />
        <button className={styles.submitBtn} type="submit" disabled={isProcessing || !input.trim()} aria-label="Send message">
          &#x27A4;
        </button>
      </form>
    </div>
  );
}
