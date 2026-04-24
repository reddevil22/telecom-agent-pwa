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

export interface DataTransferResult {
  success: boolean;
  message: string;
  senderBalance: Balance;
  recipientName: string;
  recipientMsisdn: string;
  amountMb: number;
  sourceBundleName: string;
  remainingMb: number;
}

export interface DataGiftBffPort {
  resolveRecipient(userId: string, query: string): Promise<{ userId: string; name: string; msisdn: string } | null>;
  validateAllowance(userId: string, amountMb: number): Promise<{ valid: boolean; sourceBundleName: string; availableMb: number }>;
  transferData(senderId: string, recipientId: string, amountMb: number): Promise<DataTransferResult>;
}
