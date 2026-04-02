import { useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { orchestratorMachine } from '../../machines/orchestratorMachine';
import { ScreenRenderer } from '../ScreenRenderer/ScreenRenderer';
import { PromptContainer } from '../PromptContainer/PromptContainer';
import { ProcessingIndicator } from '../ProcessingIndicator/ProcessingIndicator';
import { selectHasReceivedFirstResponse, selectProcessingSteps, selectState } from '../../hooks/useSelectors';
import styles from './AppShell.module.css';

type Actor = ActorRefFrom<typeof orchestratorMachine>;

interface Props {
  actor: Actor;
}

export function AppShell({ actor }: Props) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  const state = useSelector(actor, selectState);
  const hasReceivedFirstResponse = useSelector(actor, selectHasReceivedFirstResponse);
  const processingSteps = useSelector(actor, selectProcessingSteps);
  const isProcessing = state === 'processing';
  const isInitial = !hasReceivedFirstResponse && !isProcessing;

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  return (
    <div className={styles.shell}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.brandGroup}>
          <div className={styles.brandIcon}>T</div>
          <h1 className={styles.brandTitle}>Telecom Agent</h1>
        </div>
        <button
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '◐' : '◑'}
        </button>
      </header>

      {/* Initial welcome state */}
      {isInitial && (
        <div className={styles.content}>
          <div className={styles.initialContent}>
            <h2 className={styles.initialTitle}>How can I help you today?</h2>
            <p className={styles.initialSubtitle}>
              Check your balance, explore bundles, or get support — I'm here to help.
            </p>
          </div>
        </div>
      )}

      {/* Active state with screen */}
      {!isInitial && (
        <div className={styles.content}>
          {isProcessing && <ProcessingIndicator steps={processingSteps} />}
          {!isProcessing && <ScreenRenderer actor={actor} />}
        </div>
      )}

      {/* Prompt area */}
      <div className={styles.promptArea}>
        <PromptContainer actor={actor} />
      </div>
    </div>
  );
}
