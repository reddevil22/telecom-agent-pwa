import { Injectable } from '@nestjs/common';
import type { Database, Statement } from 'better-sqlite3';
import { SqliteConnectionService } from './sqlite-connection.service';
import type { ConversationStoragePort } from '../../domain/ports/conversation-storage.port';
import { randomUUID } from 'crypto';

@Injectable()
export class SqliteConversationDataMapper implements ConversationStoragePort {
  private readonly db: Database;
  private readonly statements: {
    createConversation: Statement;
    getConversationBySession: Statement;
    getConversationsByUser: Statement;
    getMessagesByConversation: Statement;
    addMessage: Statement;
    softDeleteConversation: Statement;
    updateConversationTimestamp: Statement;
  };

  constructor(connection: SqliteConnectionService) {
    this.db = connection.getDatabase();
    this.statements = {
      createConversation: this.db.prepare(`
        INSERT INTO conversations (id, session_id, user_id, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `),
      getConversationBySession: this.db.prepare(`
        SELECT * FROM conversations 
        WHERE session_id = ? AND deleted_at IS NULL
      `),
      getConversationsByUser: this.db.prepare(`
        SELECT c.*, COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.user_id = ? AND c.deleted_at IS NULL
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT ?
      `),
      getMessagesByConversation: this.db.prepare(`
        SELECT * FROM messages 
        WHERE conversation_id = ? 
        ORDER BY timestamp ASC
      `),
      addMessage: this.db.prepare(`
        INSERT INTO messages (id, conversation_id, role, text, screen_type, timestamp, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `),
      softDeleteConversation: this.db.prepare(`
        UPDATE conversations 
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND deleted_at IS NULL
      `),
      updateConversationTimestamp: this.db.prepare(`
        UPDATE conversations SET updated_at = datetime('now') WHERE id = ?
      `),
    };
  }

  createConversation(sessionId: string, userId: string): string {
    const id = randomUUID();
    this.statements.createConversation.run(id, sessionId, userId);
    return id;
  }

  getConversation(sessionId: string) {
    const row = this.statements.getConversationBySession.get(sessionId) as 
      { id: string; session_id: string; user_id: string; created_at: string; updated_at: string } | undefined;
    
    if (!row) return undefined;

    const messages = this.statements.getMessagesByConversation.all(row.id) as 
      Array<{ id: string; role: string; text: string; screen_type: string | null; timestamp: number }>;

    return this.toDocument(row, messages);
  }

  getConversationsByUser(userId: string, limit: number = 10) {
    const rows = this.statements.getConversationsByUser.all(userId, limit) as 
      Array<{ id: string; session_id: string; user_id: string; updated_at: string; message_count: number }>;

    return rows.map(row => ({
      sessionId: row.session_id,
      messageCount: row.message_count,
      updatedAt: new Date(row.updated_at),
    }));
  }

  addMessage(
    conversationId: string,
    role: 'user' | 'agent',
    text: string,
    screenType: string | null,
    timestamp: number,
  ): void {
    this.statements.addMessage.run(randomUUID(), conversationId, role, text, screenType, timestamp);
    this.statements.updateConversationTimestamp.run(conversationId);
  }

  softDeleteConversation(conversationId: string): void {
    this.statements.softDeleteConversation.run(conversationId);
  }

  private toDocument(
    row: { id: string; session_id: string; user_id: string; created_at: string; updated_at: string },
    messages: Array<{ id: string; role: string; text: string; screen_type: string | null; timestamp: number }>,
  ): import('../../domain/ports/conversation-storage.port').ConversationDocument {
    return {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role as 'user' | 'agent',
        text: m.text,
        screenType: (m.screen_type ?? undefined) as 'balance' | 'bundles' | 'usage' | 'support' | 'unknown' | undefined,
        timestamp: m.timestamp,
      })),
      metadata: {
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        totalMessages: messages.length,
      },
    };
  }
}
