import type { Balance, Bundle, UsageEntry, SupportTicket } from '../types/domain';

export interface BalanceBffPort {
  getBalance(userId: string): Promise<Balance>;
}

export interface BundlesBffPort {
  getBundles(userId: string): Promise<Bundle[]>;
}

export interface UsageBffPort {
  getUsage(userId: string): Promise<UsageEntry[]>;
}

export interface SupportBffPort {
  getTickets(userId: string): Promise<SupportTicket[]>;
  getFaq(): Promise<Array<{ question: string; answer: string }>>;
}
