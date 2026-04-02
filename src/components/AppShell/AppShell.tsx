import { useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { orchestratorMachine } from '../../machines/orchestratorMachine';
import { ScreenRenderer } from '../ScreenRenderer/ScreenRenderer';
import { PromptContainer } from '../PromptContainer/PromptContainer';
import { ProcessingIndicator } from '../ProcessingIndicator/ProcessingIndicator';
import { ChatBubble } from '../ChatBubble/ChatBubble';
import { selectHasReceivedFirstResponse, selectProcessingSteps, selectState, selectConversationHistory } from '../../hooks/useSelectors';
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
  const conversationHistory = useSelector(actor, selectConversationHistory);
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

      <div className={styles.main}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarSection}>
            <span className={styles.sidebarLabel}>Account Overview</span>
            <div className={styles.sidebarStat}>
              <span className={styles.sidebarStatLabel}>Balance</span>
              <span className={styles.sidebarStatValue}>$42.50</span>
            </div>
            <div className={styles.sidebarStat}>
              <span className={styles.sidebarStatLabel}>Data</span>
              <span className={styles.sidebarStatValue}>3.7 / 10 GB</span>
            </div>
            <div className={styles.sidebarStat}>
              <span className={styles.sidebarStatLabel}>Voice</span>
              <span className={styles.sidebarStatValue}>142 / 500 min</span>
            </div>
            <div className={styles.sidebarStat}>
              <span className={styles.sidebarStatLabel}>SMS</span>
              <span className={styles.sidebarStatValue}>28 / 200</span>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className={styles.content}>
          <div className={`${styles.contentArea} ${isInitial ? styles['contentArea--initial'] : ''}`}>
            {isInitial && (
              <div className={styles.initialContent}>
                <h2 className={styles.initialTitle}>How can I help you today?</h2>
                <p className={styles.initialSubtitle}>
                  Check your balance, explore bundles, or get support — I'm here to help.
                </p>
              </div>
            )}

            {/* Chat history */}
            {conversationHistory.length > 0 && (
              <div className={styles.chatHistory}>
                {conversationHistory.map((msg, i) => (
                  <ChatBubble key={i} message={msg} />
                ))}
              </div>
            )}

            {!isInitial && isProcessing && <ProcessingIndicator steps={processingSteps} />}
            {!isInitial && !isProcessing && <ScreenRenderer actor={actor} />}
          </div>

          {/* Prompt area */}
          <div className={styles.promptArea}>
            <PromptContainer actor={actor} />
          </div>
        </div>
      </div>
    </div>
  );
}
