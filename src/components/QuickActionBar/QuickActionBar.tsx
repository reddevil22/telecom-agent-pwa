import { useState, useEffect } from 'react';
import styles from './QuickActionBar.module.css';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  syntheticPrompt: string;
}

interface Props {
  onAction: (prompt: string) => void;
  disabled?: boolean;
}

export function QuickActionBar({ onAction, disabled }: Props) {
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/agent/quick-actions')
      .then(res => res.ok ? res.json() : { actions: DEFAULT_ACTIONS })
      .then(data => {
        if (!cancelled) {
          setActions(data.actions ?? DEFAULT_ACTIONS);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setActions(DEFAULT_ACTIONS);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  if (loading || actions.length === 0) return null;

  return (
    <div className={styles.bar} data-testid="quick-actions">
      {actions.map(action => (
        <button
          key={action.id}
          className={styles.button}
          onClick={() => onAction(action.syntheticPrompt)}
          disabled={disabled}
          data-testid={`quick-action-${action.id}`}
          aria-label={action.syntheticPrompt}
        >
          <span className={styles.icon}>{action.icon}</span>
          <span className={styles.label}>{action.label}</span>
        </button>
      ))}
    </div>
  );
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { id: 'balance', label: 'Balance', icon: '💰', syntheticPrompt: 'Show my balance' },
  { id: 'bundles', label: 'Bundles', icon: '📦', syntheticPrompt: 'What bundles are available?' },
  { id: 'usage', label: 'Usage', icon: '📊', syntheticPrompt: 'Check my usage' },
  { id: 'support', label: 'Support', icon: '🎧', syntheticPrompt: 'I need support' },
  { id: 'account', label: 'Account', icon: '👤', syntheticPrompt: 'Show my account' },
];
