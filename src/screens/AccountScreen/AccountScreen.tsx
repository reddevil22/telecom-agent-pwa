import type { ScreenData } from '../../types/agent';
import type { ScreenActor } from '../../types/screens';
import styles from './AccountScreen.module.css';

interface Props {
  data: ScreenData;
  actor: ScreenActor;
}

function formatMbToGb(mb: number): string {
  return (mb / 1024).toFixed(1);
}

function formatIsoDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function AccountScreen({ data }: Props) {
  if (data.type !== 'account') return null;
  const { profile, activeSubscriptions, recentTransactions, openTickets } = data;

  return (
    <div className={styles.container}>
      {/* Profile */}
      <div className={styles.profileCard}>
        <div className={styles.profileName}>{profile.name}</div>
        <div className={styles.profilePhone}>{profile.msisdn}</div>
        <div className={styles.profileGrid}>
          <div className={styles.profileItem}>
            <span className={styles.profileLabel}>Plan</span>
            <span className={styles.profileValue}>{profile.plan}</span>
          </div>
          <div className={styles.profileItem}>
            <span className={styles.profileLabel}>Status</span>
            <span className={styles.profileValue}>{profile.status}</span>
          </div>
          <div className={styles.profileItem}>
            <span className={styles.profileLabel}>Balance</span>
            <span className={styles.profileBalance}>
              {profile.balance.currency} {profile.balance.current.toFixed(2)}
            </span>
          </div>
          <div className={styles.profileItem}>
            <span className={styles.profileLabel}>Billing Cycle</span>
            <span className={styles.profileValue}>
              {formatIsoDate(profile.billingCycleStart)} – {formatIsoDate(profile.billingCycleEnd)}
            </span>
          </div>
        </div>
      </div>

      {/* Active Subscriptions */}
      <div>
        <h3 className={styles.heading}>Active Subscriptions</h3>
        {activeSubscriptions.length === 0 ? (
          <div className={styles.emptyState}>No active subscriptions</div>
        ) : (
          <div className={styles.subCard}>
            {activeSubscriptions.map((sub) => (
              <div key={sub.subscriptionId} style={{ marginBottom: activeSubscriptions.length > 1 ? 'var(--space-md)' : 0 }}>
                <div className={styles.subHeader}>
                  <span className={styles.subName}>{sub.bundleName}</span>
                  <span className={styles.subExpiry}>expires {formatIsoDate(sub.expiresAt)}</span>
                </div>
                <div className={styles.subUsage}>
                  <UsageBar label="Data" used={`${formatMbToGb(sub.dataUsedMb)} / ${formatMbToGb(sub.dataTotalMb)} GB`} pct={sub.dataTotalMb > 0 ? Math.min((sub.dataUsedMb / sub.dataTotalMb) * 100, 100) : 0} />
                  <UsageBar label="Voice" used={`${sub.minutesUsed} / ${sub.minutesTotal} min`} pct={sub.minutesTotal > 0 ? Math.min((sub.minutesUsed / sub.minutesTotal) * 100, 100) : 0} />
                  <UsageBar label="SMS" used={`${sub.smsUsed} / ${sub.smsTotal}`} pct={sub.smsTotal > 0 ? Math.min((sub.smsUsed / sub.smsTotal) * 100, 100) : 0} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      <div>
        <h3 className={styles.heading}>Recent Activity</h3>
        {recentTransactions.length === 0 ? (
          <div className={styles.emptyState}>No recent activity</div>
        ) : (
          <div className={styles.txList}>
            {recentTransactions.map((tx) => (
              <div key={tx.id} className={styles.txItem}>
                <div className={styles.txLeft}>
                  <span className={styles.txDesc}>{tx.description}</span>
                  <span className={styles.txDate}>{formatIsoDate(tx.timestamp)}</span>
                </div>
                {tx.amount != null && (
                  <span className={`${styles.txAmount} ${styles[`txAmount--${tx.type}`]}`}>
                    {tx.type === 'topup' ? '+' : tx.type === 'purchase' ? '-' : ''}
                    {tx.currency ?? 'USD'} {tx.amount.toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Open Tickets */}
      {openTickets.length > 0 && (
        <div>
          <h3 className={styles.heading}>Open Tickets</h3>
          <div className={styles.ticketList}>
            {openTickets.map((ticket) => (
              <div key={ticket.id} className={styles.ticketItem}>
                <div className={styles.ticketInfo}>
                  <div className={styles.ticketSubject}>{ticket.subject}</div>
                  <div className={styles.ticketUpdated}>Updated {formatIsoDate(ticket.updatedAt)}</div>
                </div>
                <span className={`${styles.statusBadge} ${styles[`statusBadge--${ticket.status}`]}`}>
                  {ticket.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UsageBar({ label, used, pct }: { label: string; used: string; pct: number }) {
  return (
    <div className={styles.usageRow}>
      <div className={styles.usageLabel}>
        <span>{label}</span>
        <span>{used}</span>
      </div>
      <div className={styles.usageBarTrack}>
        <div className={styles.usageBarFill} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}
