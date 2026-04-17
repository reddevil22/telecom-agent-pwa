import { Test, TestingModule } from '@nestjs/testing';
import Database from 'better-sqlite3';
import { SqliteConnectionService } from './sqlite-connection.service';
import { SqliteConversationDataMapper } from './conversation-data.mapper';
import { up as runMigration001 } from './migrations/001_initial';

describe('SqliteConversationDataMapper', () => {
  let mapper: SqliteConversationDataMapper;
  let db: Database.Database;

  beforeAll(() => {
    db = new Database(':memory:');
    runMigration001(db);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec('DELETE FROM messages');
    db.exec('DELETE FROM conversations');
    const mockConnection = { getDatabase: () => db };
    mapper = new SqliteConversationDataMapper(mockConnection as any);
  });

  describe('createConversation', () => {
    it('should create conversation and return UUID', () => {
      const id = mapper.createConversation('session-1', 'user-1');
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('getConversation', () => {
    it('should return undefined for non-existent session', () => {
      expect(mapper.getConversation('nonexistent', 'user-1')).toBeUndefined();
    });

    it('should return conversation with messages for existing session', () => {
      const id = mapper.createConversation('session-1', 'user-1');
      mapper.addMessage(id, 'user', 'Hello', null, Date.now());
      mapper.addMessage(id, 'agent', 'Hi there', 'balance', Date.now() + 1000);

      const conv = mapper.getConversation('session-1', 'user-1');

      expect(conv).toBeDefined();
      expect(conv?.sessionId).toBe('session-1');
      expect(conv?.messages.length).toBe(2);
      expect(conv?.messages[0].text).toBe('Hello');
      expect(conv?.messages[1].screenType).toBe('balance');
    });

    it('should return undefined for soft-deleted conversation', () => {
      const id = mapper.createConversation('session-1', 'user-1');
      mapper.addMessage(id, 'user', 'Hello', null, Date.now());
      mapper.softDeleteConversation(id);

      expect(mapper.getConversation('session-1', 'user-1')).toBeUndefined();
    });
  });

  describe('addMessage', () => {
    it('should add message to conversation', () => {
      const id = mapper.createConversation('session-1', 'user-1');
      mapper.addMessage(id, 'user', 'Hello', null, Date.now());

      const conv = mapper.getConversation('session-1', 'user-1');
      expect(conv?.messages.length).toBe(1);
      expect(conv?.messages[0].text).toBe('Hello');
    });

    it('should update conversation updated_at when adding message', () => {
      const id = mapper.createConversation('session-1', 'user-1');
      const beforeConv = mapper.getConversation('session-1', 'user-1');
      
      // SQLite datetime('now') has second precision, so we need to wait
      const start = Date.now();
      while (Date.now() - start < 1100) {} // Wait 1+ second for SQLite datetime
      
      mapper.addMessage(id, 'agent', 'Response', 'balance', Date.now());
      
      const afterConv = mapper.getConversation('session-1', 'user-1');
      expect(afterConv?.metadata.updatedAt.getTime())
        .toBeGreaterThan(beforeConv?.metadata.updatedAt.getTime() || 0);
    });

    it('should throw FK violation when adding message to non-existent conversation', () => {
      expect(() => {
        mapper.addMessage('nonexistent-id', 'user', 'Hello', null, Date.now());
      }).toThrow();
    });
  });

  describe('getConversationsByUser', () => {
    it('should return conversations ordered by updated_at', () => {
      mapper.createConversation('session-1', 'user-1');
      
      // Wait for SQLite datetime precision
      const start = Date.now();
      while (Date.now() - start < 1100) {}
      
      mapper.createConversation('session-2', 'user-1');

      const convs = mapper.getConversationsByUser('user-1');

      expect(convs.length).toBe(2);
      expect(convs[0].sessionId).toBe('session-2'); // Most recent first
    });

    it('should respect limit parameter', () => {
      mapper.createConversation('session-1', 'user-1');
      mapper.createConversation('session-2', 'user-1');
      mapper.createConversation('session-3', 'user-1');

      const convs = mapper.getConversationsByUser('user-1', 2);
      expect(convs.length).toBe(2);
    });

    it('should exclude soft-deleted conversations', () => {
      const id = mapper.createConversation('session-1', 'user-1');
      mapper.createConversation('session-2', 'user-1');
      mapper.softDeleteConversation(id);

      const convs = mapper.getConversationsByUser('user-1');
      expect(convs.length).toBe(1);
      expect(convs[0].sessionId).toBe('session-2');
    });

    it('should return empty array for user with no conversations', () => {
      const convs = mapper.getConversationsByUser('nonexistent-user');
      expect(convs).toEqual([]);
    });

    it('should return camelCase properties', () => {
      mapper.createConversation('session-1', 'user-1');
      const convs = mapper.getConversationsByUser('user-1');

      expect(convs[0]).toHaveProperty('sessionId');
      expect(convs[0]).toHaveProperty('messageCount');
      expect(convs[0]).toHaveProperty('updatedAt');
      expect(convs[0]).not.toHaveProperty('session_id');
    });
  });

  describe('softDeleteConversation', () => {
    it('should soft delete conversation', () => {
      const id = mapper.createConversation('session-1', 'user-1');
      mapper.softDeleteConversation(id);

      expect(mapper.getConversation('session-1', 'user-1')).toBeUndefined();
    });

    it('should be idempotent (double delete does not crash)', () => {
      const id = mapper.createConversation('session-1', 'user-1');
      mapper.softDeleteConversation(id);
      
      expect(() => mapper.softDeleteConversation(id)).not.toThrow();
    });

    it('should not affect other users conversations', () => {
      mapper.createConversation('session-1', 'user-1');
      const id2 = mapper.createConversation('session-2', 'user-2');
      
      mapper.softDeleteConversation(id2);
      
      expect(mapper.getConversation('session-1', 'user-1')).toBeDefined();
      expect(mapper.getConversation('session-2', 'user-2')).toBeUndefined();
    });
  });

  describe('conversation isolation by user', () => {
    it('should not return wrong user conversations', () => {
      mapper.createConversation('session-1', 'user-1');
      mapper.createConversation('session-2', 'user-2');

      const user1Convs = mapper.getConversationsByUser('user-1');
      const user2Convs = mapper.getConversationsByUser('user-2');

      expect(user1Convs.length).toBe(1);
      expect(user1Convs[0].sessionId).toBe('session-1');
      expect(user2Convs.length).toBe(1);
      expect(user2Convs[0].sessionId).toBe('session-2');
    });
  });
});
