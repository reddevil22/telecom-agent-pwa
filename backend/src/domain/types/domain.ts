export interface Balance {
  current: number;
  currency: string;
  lastTopUp: string;
  nextBillingDate: string;
}

export interface Bundle {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  dataGB: number;
  minutes: number;
  sms: number;
  validity: string;
  popular?: boolean;
}

export interface UsageEntry {
  type: 'data' | 'voice' | 'sms';
  used: number;
  total: number;
  unit: string;
  period: string;
}

export interface SupportTicket {
  id: string;
  status: 'open' | 'in_progress' | 'resolved';
  subject: string;
  description: string;
  createdAt: string;
}

export interface OwnedBundle {
  bundleId: string;
  purchasedAt: string;
  expiresAt: string;
}

export interface AccountProfile {
  name: string;
  msisdn: string;
  plan: string;
  status: string;
  balance: Balance;
  billingCycleStart: string;
  billingCycleEnd: string;
}

export interface ActiveSubscription {
  subscriptionId: string;
  bundleName: string;
  bundleId: string;
  status: string;
  activatedAt: string;
  expiresAt: string;
  dataUsedMb: number;
  dataTotalMb: number;
  minutesUsed: number;
  minutesTotal: number;
  smsUsed: number;
  smsTotal: number;
}

export interface TransactionEntry {
  id: string;
  type: 'purchase' | 'topup' | 'ticket';
  description: string;
  amount?: number;
  currency?: string;
  timestamp: string;
}

export interface OpenTicket {
  id: string;
  status: string;
  subject: string;
  updatedAt: string;
}

export interface ConversationMessage {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
}
