import type { Balance, Bundle, UsageEntry, SupportTicket } from '../types/domain';

export interface PurchaseResult {
  success: boolean;
  message: string;
  balance: Balance;
  bundle: Bundle | null;
}

export interface BalanceBffPort {
  getBalance(userId: string): Promise<Balance>;
  topUp(userId: string, amount: number): Promise<Balance>;
}

export interface BundlesBffPort {
  getBundles(userId: string): Promise<Bundle[]>;
  purchaseBundle(userId: string, bundleId: string): Promise<PurchaseResult>;
}

export interface UsageBffPort {
  getUsage(userId: string): Promise<UsageEntry[]>;
}

export interface SupportBffPort {
  getTickets(userId: string): Promise<SupportTicket[]>;
  getFaq(): Promise<Array<{ question: string; answer: string }>>;
  createTicket(userId: string, subject: string, description: string): Promise<SupportTicket>;
}
