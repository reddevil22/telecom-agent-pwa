import { useEffect, useState } from 'react';
import styles from './LlmErrorScreen.module.css';

export interface LlmHealthStatus {
  status: 'healthy' | 'unhealthy' | 'unknown';
  url: string;
  responseTime?: number;
  error?: string;
}

interface Props {
  onRetry?: () => void;
}

export function LlmErrorScreen({ onRetry }: Props) {
  const [health, setHealth] = useState<LlmHealthStatus | null>(null);
  const [checking, setChecking] = useState(false);

  const checkLlmHealth = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/health/llm');
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({
        status: 'unhealthy',
        url: 'unknown',
        error: 'Failed to connect to backend',
      });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkLlmHealth();
  }, []);

  const handleRetry = () => {
    checkLlmHealth();
    onRetry?.();
  };

  return (
    <div className={styles.container}>
      <div className={styles.icon}>⚠️</div>
      <h2 className={styles.title}>AI Service Unavailable</h2>
      <p className={styles.subtitle}>
        The AI assistant cannot process requests at the moment.
      </p>

      <div className={styles.statusCard}>
        <div className={styles.statusRow}>
          <span className={styles.label}>LLM Server:</span>
          <span className={`${styles.status} ${styles[health?.status || 'unknown']}`}>
            {checking ? 'Checking...' : health?.status === 'healthy' ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        {health?.url && (
          <div className={styles.statusRow}>
            <span className={styles.label}>URL:</span>
            <code className={styles.url}>{health.url}</code>
          </div>
        )}
        
        {health?.error && (
          <div className={styles.statusRow}>
            <span className={styles.label}>Error:</span>
            <span className={styles.error}>{health.error}</span>
          </div>
        )}
        
        {health?.responseTime && (
          <div className={styles.statusRow}>
            <span className={styles.label}>Response Time:</span>
            <span className={styles.value}>{health.responseTime}ms</span>
          </div>
        )}
      </div>

      <div className={styles.help}>
        <h3 className={styles.helpTitle}>How to fix:</h3>
        <ol className={styles.steps}>
          <li>Start the llama-server:</li>
        </ol>
        <pre className={styles.command}>
          llama-server --model your-model.gguf --port 8080
        </pre>
        <ol className={styles.steps} start={2}>
          <li>Wait for the server to fully load</li>
          <li>Click "Check Status" below</li>
        </ol>
      </div>

      <button className={styles.retryButton} onClick={handleRetry} disabled={checking}>
        {checking ? 'Checking...' : 'Check Status'}
      </button>
    </div>
  );
}
