// ── Domain types ──

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
  createdAt: string;
}

export interface ConversationMessage {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
}
