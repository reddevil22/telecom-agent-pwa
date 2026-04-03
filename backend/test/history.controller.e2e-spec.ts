import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SqliteConversationDataMapper } from '../src/infrastructure/data/conversation-data.mapper';
import { CONVERSATION_STORAGE_PORT } from '../src/domain/tokens';

describe('HistoryController (e2e)', () => {
  let app: INestApplication;
  let storage: SqliteConversationDataMapper;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    storage = moduleFixture.get<SqliteConversationDataMapper>(CONVERSATION_STORAGE_PORT);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    const db = (storage as any).db as import('better-sqlite3').Database;
    db.exec('DELETE FROM messages');
    db.exec('DELETE FROM conversations');
  });

  describe('GET /api/history/sessions', () => {
    it('should return 400 when userId is missing', () => {
      return request(app.getHttpServer())
        .get('/api/history/sessions')
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('userId');
        });
    });

    it('should return 400 when userId is empty string', () => {
      return request(app.getHttpServer())
        .get('/api/history/sessions?userId=')
        .expect(400);
    });

    it('should return empty array for user with no conversations', () => {
      return request(app.getHttpServer())
        .get('/api/history/sessions?userId=user-new')
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([]);
        });
    });

    it('should return conversations for user', () => {
      const conversationId = storage.createConversation('session-1', 'user-1');
      storage.addMessage(conversationId, 'user', 'Hello', null, Date.now());

      return request(app.getHttpServer())
        .get('/api/history/sessions?userId=user-1')
        .expect(200)
        .expect((res) => {
          expect(res.body.length).toBe(1);
          expect(res.body[0].sessionId).toBe('session-1');
          expect(res.body[0].messageCount).toBe(1);
          expect(res.body[0]).toHaveProperty('updatedAt');
        });
    });

    it('should respect limit parameter', () => {
      storage.createConversation('session-1', 'user-1');
      storage.createConversation('session-2', 'user-1');
      storage.createConversation('session-3', 'user-1');

      return request(app.getHttpServer())
        .get('/api/history/sessions?userId=user-1&limit=2')
        .expect(200)
        .expect((res) => {
          expect(res.body.length).toBe(2);
        });
    });

    it('should exclude soft-deleted conversations', () => {
      const id = storage.createConversation('session-1', 'user-1');
      storage.createConversation('session-2', 'user-1');
      storage.softDeleteConversation(id);

      return request(app.getHttpServer())
        .get('/api/history/sessions?userId=user-1')
        .expect(200)
        .expect((res) => {
          expect(res.body.length).toBe(1);
          expect(res.body[0].sessionId).toBe('session-2');
        });
    });
  });

  describe('GET /api/history/session/:sessionId', () => {
    it('should return 404 for non-existent session', () => {
      return request(app.getHttpServer())
        .get('/api/history/session/nonexistent')
        .expect(404);
    });

    it('should return 404 for soft-deleted session', () => {
      const id = storage.createConversation('session-1', 'user-1');
      storage.softDeleteConversation(id);

      return request(app.getHttpServer())
        .get('/api/history/session/session-1')
        .expect(404);
    });

    it('should return conversation with messages', () => {
      const id = storage.createConversation('session-1', 'user-1');
      storage.addMessage(id, 'user', 'Check my balance', null, Date.now());
      storage.addMessage(id, 'agent', 'Your balance is $42.50', 'balance', Date.now() + 1000);

      return request(app.getHttpServer())
        .get('/api/history/session/session-1')
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.sessionId).toBe('session-1');
          expect(res.body.messages.length).toBe(2);
          expect(res.body.messages[0].text).toBe('Check my balance');
          expect(res.body.messages[1].screenType).toBe('balance');
        });
    });

    it('should return camelCase properties', () => {
      const id = storage.createConversation('session-1', 'user-1');
      storage.addMessage(id, 'user', 'Hello', null, Date.now());

      return request(app.getHttpServer())
        .get('/api/history/session/session-1')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('sessionId');
          expect(res.body).toHaveProperty('userId');
          expect(res.body).toHaveProperty('messages');
          expect(res.body).toHaveProperty('metadata');
          expect(res.body).not.toHaveProperty('session_id');
        });
    });
  });

  describe('DELETE /api/history/session/:sessionId', () => {
    it('should return 404 for non-existent session', () => {
      return request(app.getHttpServer())
        .delete('/api/history/session/nonexistent')
        .expect(404);
    });

    it('should soft delete existing session', () => {
      storage.createConversation('session-1', 'user-1');

      return request(app.getHttpServer())
        .delete('/api/history/session/session-1')
        .expect(200)
        .expect((res) => {
          expect(res.body.deleted).toBe(true);
          expect(res.body.sessionId).toBe('session-1');
        })
        .then(() => {
          return request(app.getHttpServer())
            .get('/api/history/session/session-1')
            .expect(404);
        });
    });

    it('should be idempotent (delete already deleted returns 404)', () => {
      const id = storage.createConversation('session-1', 'user-1');
      storage.softDeleteConversation(id);

      return request(app.getHttpServer())
        .delete('/api/history/session/session-1')
        .expect(404);
    });
  });
});
