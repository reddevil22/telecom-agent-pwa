export interface ConversationMessageRow {
  id: string;
  role: 'user' | 'agent';
  text: string;
  screen_type: string | null;
  timestamp: number;
}

export interface ConversationRow {
  id: string;
  session_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ConversationDocument {
  id: string;
  sessionId: string;
  userId: string;
  messages: Array<{
    id: string;
    role: 'user' | 'agent';
    text: string;
    screenType?: 'balance' | 'bundles' | 'usage' | 'support' | 'unknown';
    timestamp: number;
  }>;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    totalMessages: number;
  };
}

export interface ConversationStoragePort {
  // Core CRUD operations
  createConversation(sessionId: string, userId: string): string;
  getConversation(sessionId: string): ConversationDocument | undefined;
  getConversationsByUser(userId: string, limit?: number): Array<{
    sessionId: string;
    messageCount: number;
    updatedAt: Date;
  }>;
  addMessage(
    conversationId: string,
    role: 'user' | 'agent',
    text: string,
    screenType: string | null,
    timestamp: number,
  ): void;
  softDeleteConversation(conversationId: string): void;
}
