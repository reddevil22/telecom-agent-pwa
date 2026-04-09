import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { orchestratorMachine } from '../../machines/orchestratorMachine';
import { ScreenRenderer } from '../ScreenRenderer/ScreenRenderer';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { PromptContainer } from '../PromptContainer/PromptContainer';
import { ProcessingIndicator } from '../ProcessingIndicator/ProcessingIndicator';
import { ChatBubble } from '../ChatBubble/ChatBubble';
import { SessionList, type SessionSummary } from '../SessionList/SessionList';
import { LlmErrorScreen } from '../LlmErrorScreen/LlmErrorScreen';
import { QuickActionBar } from '../QuickActionBar/QuickActionBar';
import { DegradedBanner } from '../DegradedBanner/DegradedBanner';
import { llmStatusService, type LlmStatus } from '../../services/llmStatusService';
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
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [isDegraded, setIsDegraded] = useState(false);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // LLM status polling
  useEffect(() => {
    const unsub = llmStatusService.subscribe((status: LlmStatus) => {
      setIsDegraded(status.mode === 'degraded');
    });
    llmStatusService.startPolling();
    return () => {
      unsub();
      llmStatusService.stopPolling();
    };
  }, []);

  const handleQuickAction = useCallback((prompt: string) => {
    actor.send({ type: 'SUBMIT_PROMPT', prompt });
  }, [actor]);

  const state = useSelector(actor, selectState);
  const hasReceivedFirstResponse = useSelector(actor, selectHasReceivedFirstResponse);
  const processingSteps = useSelector(actor, selectProcessingSteps);
  const conversationHistory = useSelector(actor, selectConversationHistory);
  const isProcessing = state === 'processing';
  const isError = state === 'error';
  const hasMessages = conversationHistory.length > 0;
  const isInitial = !hasReceivedFirstResponse && !isProcessing && !hasMessages;

  const sessionId = useSelector(actor, (s) => s.context.sessionId);

  // Scroll to bottom when response appears and focus input
  useEffect(() => {
    if (!isInitial && !isProcessing && !isError && contentAreaRef.current) {
      const el = contentAreaRef.current;
      // Only scroll if user is already near the bottom (within 100px)
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      if (nearBottom) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
      // Only focus input if nothing in the content area has focus
      const activeEl = document.activeElement;
      const contentHasFocus = activeEl && el.contains(activeEl);
      if (!contentHasFocus) {
        setTimeout(() => inputRef.current?.focus(), 300);
      }
    }
  }, [isProcessing, isInitial, isError]);

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
      setSessionError(null);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setSessionError(error instanceof Error ? error.message : 'Failed to load sessions');
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

  function handleTabKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveTab((prev) => (prev === 'chat' ? 'history' : 'chat'));
    }
  }

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
          <div className={styles.brandIcon}>
            <div className={styles.brandIconRing}></div>
            <div className={styles.brandIconInner}>T</div>
          </div>
          <h1 className={styles.brandTitle}>Telecom Agent</h1>
        </div>
        <button
          className={styles.themeToggle}
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '☾' : '☀'}
        </button>
      </header>

      <div className={styles.main}>
        {/* Degraded mode banner */}
        {isDegraded && <DegradedBanner />}

        {/* Main content */}
        <div className={styles.content}>
          {/* Tabs */}
          <div className={styles.tabs} role="tablist" onKeyDown={handleTabKeyDown}>
            <button
              className={`${styles.tab} ${activeTab === 'chat' ? styles.active : ''}`}
              onClick={() => setActiveTab('chat')}
              data-testid="chat-tab"
              role="tab"
              aria-selected={activeTab === 'chat'}
            >
              Chat
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'history' ? styles.active : ''}`}
              onClick={() => setActiveTab('history')}
              data-testid="history-tab"
              role="tab"
              aria-selected={activeTab === 'history'}
            >
              History
            </button>
          </div>

          <div className={styles.contentAreaWrapper}>
            {activeTab === 'history' ? (
              <div className={styles.historyContent} data-testid="session-list">
                {sessionError && (
                  <div className={styles.sessionError} role="alert">
                    <p>{sessionError}</p>
                    <button onClick={loadSessions}>Retry</button>
                  </div>
                )}
                <SessionList
                  sessions={sessions}
                  onSelectSession={handleSelectSession}
                  onDeleteSession={handleDeleteSession}
                />
              </div>
            ) : (
              <div ref={contentAreaRef} className={`${styles.contentArea} ${isInitial ? styles['contentArea--initial'] : ''}`}>
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
                    {conversationHistory.map((msg) => (
                      <ChatBubble key={`${msg.role}-${msg.timestamp}`} message={msg} data-testid="chat-bubble" />
                    ))}
                  </div>
                )}

                {!isInitial && isProcessing && <ProcessingIndicator steps={processingSteps} />}

                {!isInitial && !isProcessing && isError && (
                  <LlmErrorScreen onRetry={() => actor.send({ type: 'RESET' })} />
                )}

                {!isInitial && !isProcessing && !isError && (
                  <ErrorBoundary onReset={() => actor.send({ type: 'RESET' })}>
                    <ScreenRenderer actor={actor} />
                  </ErrorBoundary>
                )}
              </div>
            )}
          </div>

          {/* Prompt area - only show in chat tab */}
          {activeTab === 'chat' && (
            <div className={styles.promptArea}>
              <QuickActionBar onAction={handleQuickAction} />
              {!isDegraded && <PromptContainer actor={actor} inputRef={inputRef} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
