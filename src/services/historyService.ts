export interface SessionSummary {
  sessionId: string;
  messageCount: number;
  lastMessageAt: number;
}

export interface ConversationMessage {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
}

export interface ConversationDocument {
  id: string;
  sessionId: string;
  userId: string;
  messages: ConversationMessage[];
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    totalMessages: number;
  };
}

export const historyService = {
  async getSavedSessions(userId: string): Promise<SessionSummary[]> {
    try {
      const res = await fetch(`/api/history/sessions?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) {
        if (res.status === 400) throw new Error('userId is required');
        return [];
      }
      const sessions: Array<{ sessionId: string; messageCount: number; updatedAt: string }> = await res.json();
      return sessions.map((s) => ({
        sessionId: s.sessionId,
        messageCount: s.messageCount,
        lastMessageAt: new Date(s.updatedAt).getTime(),
      }));
    } catch (error) {
      console.error('Failed to load sessions:', error);
      return [];
    }
  },

  async loadSession(sessionId: string): Promise<ConversationMessage[]> {
    const res = await fetch(`/api/history/session/${encodeURIComponent(sessionId)}`);
    if (!res.ok) throw new Error('Session not found');
    const conv: ConversationDocument = await res.json();
    return conv.messages;
  },

  async deleteSession(sessionId: string): Promise<void> {
    const res = await fetch(`/api/history/session/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete session');
  },

  getCurrentSessionId(): string | null {
    return localStorage.getItem('currentSessionId');
  },

  setCurrentSessionId(sessionId: string): void {
    localStorage.setItem('currentSessionId', sessionId);
  },

  clearCurrentSession(): void {
    localStorage.removeItem('currentSessionId');
  },
};
