export interface SessionSummary {
  sessionId: string;
  messageCount: number;
  lastMessageAt: number;
}

export interface ConversationMessage {
  role: "user" | "agent";
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
    const res = await fetch(
      `/api/history/sessions?userId=${encodeURIComponent(userId)}`,
      {
        headers: { "x-user-id": userId },
      },
    );
    if (!res.ok) {
      throw new Error(
        `Failed to load sessions: ${res.status} ${res.statusText}`,
      );
    }
    const sessions: Array<{
      sessionId: string;
      messageCount: number;
      updatedAt: string;
    }> = await res.json();
    return sessions.map((s) => ({
      sessionId: s.sessionId,
      messageCount: s.messageCount,
      lastMessageAt: new Date(s.updatedAt).getTime(),
    }));
  },

  async loadSession(
    sessionId: string,
    userId: string,
  ): Promise<ConversationMessage[]> {
    const res = await fetch(
      `/api/history/session/${encodeURIComponent(sessionId)}`,
      {
        headers: { "x-user-id": userId },
      },
    );
    if (!res.ok) throw new Error("Session not found");
    const conv: ConversationDocument = await res.json();
    return conv.messages;
  },

  async deleteSession(sessionId: string, userId: string): Promise<void> {
    const res = await fetch(
      `/api/history/session/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        headers: { "x-user-id": userId },
      },
    );
    if (!res.ok) throw new Error("Failed to delete session");
  },

  getCurrentSessionId(userId: string): string | null {
    return localStorage.getItem(`currentSessionId:${userId}`);
  },

  setCurrentSessionId(sessionId: string, userId: string): void {
    localStorage.setItem(`currentSessionId:${userId}`, sessionId);
  },

  clearCurrentSession(userId: string): void {
    localStorage.removeItem(`currentSessionId:${userId}`);
  },
};
