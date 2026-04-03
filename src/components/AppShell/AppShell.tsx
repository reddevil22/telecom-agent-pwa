import { useState, useEffect } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { orchestratorMachine } from '../../machines/orchestratorMachine';
import { ScreenRenderer } from '../ScreenRenderer/ScreenRenderer';
import { PromptContainer } from '../PromptContainer/PromptContainer';
import { ProcessingIndicator } from '../ProcessingIndicator/ProcessingIndicator';
import { ChatBubble } from '../ChatBubble/ChatBubble';
import { SessionList, type SessionSummary } from '../SessionList/SessionList';
import { LlmErrorScreen } from '../LlmErrorScreen/LlmErrorScreen';
import { selectHasReceivedFirstResponse, selectProcessingSteps, selectState, selectConversationHistory } from '../../hooks/useSelectors';
import { historyService } from '../../services/historyService';
import styles from './AppShell.module.css';

type Actor = ActorRefFrom<typeof orchestratorMachine>;

interface Props {
  actor: Actor;
}

export function AppShell({ actor }: Props) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });
  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const state = useSelector(actor, selectState);
  const hasReceivedFirstResponse = useSelector(actor, selectHasReceivedFirstResponse);
  const processingSteps = useSelector(actor, selectProcessingSteps);
  const conversationHistory = useSelector(actor, selectConversationHistory);
  const isProcessing = state === 'processing';
  const isError = state === 'error';
  const hasMessages = conversationHistory.length > 0;
  const isInitial = !hasReceivedFirstResponse && !isProcessing && !hasMessages;

  const sessionId = useSelector(actor, (s) => s.context.sessionId);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      loadSessions();
    }
  }, [activeTab, sessionId]);

  const loadSessions = async () => {
    try {
      const userId = 'user-1';
      const loadedSessions = await historyService.getSavedSessions(userId);
      setSessions(loadedSessions);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    try {
      actor.send({ type: 'LOAD_SESSION', sessionId });
      historyService.setCurrentSessionId(sessionId);
      setActiveTab('chat');
    } catch (error) {
      console.error('Failed to load session:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await historyService.deleteSession(sessionId);
      setSessions(sessions.filter((s) => s.sessionId !== sessionId));
    } catch (error) {
      console.error('Failed to delete session:', error);
    }
  };

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
          {/* Tabs */}
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'chat' ? styles.active : ''}`}
              onClick={() => setActiveTab('chat')}
              data-testid="chat-tab"
            >
              Chat
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'history' ? styles.active : ''}`}
              onClick={() => setActiveTab('history')}
              data-testid="history-tab"
            >
              History
            </button>
          </div>

          <div className={styles.contentAreaWrapper}>
            {activeTab === 'history' ? (
              <div className={styles.historyContent} data-testid="session-list">
                <SessionList
                  sessions={sessions}
                  onSelectSession={handleSelectSession}
                  onDeleteSession={handleDeleteSession}
                />
              </div>
            ) : (
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
                {hasMessages && (
                  <div className={styles.chatHistory} data-testid="chat-history">
                    {conversationHistory.map((msg, i) => (
                      <ChatBubble key={i} message={msg} data-testid="chat-bubble" />
                    ))}
                  </div>
                )}

                {!isInitial && isProcessing && <ProcessingIndicator steps={processingSteps} />}
                
                {!isInitial && !isProcessing && isError && (
                  <LlmErrorScreen onRetry={() => actor.send({ type: 'RESET' })} />
                )}
                
                {!isInitial && !isProcessing && !isError && <ScreenRenderer actor={actor} />}
              </div>
            )}
          </div>

          {/* Prompt area - only show in chat tab */}
          {activeTab === 'chat' && (
            <div className={styles.promptArea}>
              <PromptContainer actor={actor} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
