import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SqliteConversationDataMapper } from '../src/infrastructure/data/conversation-data.mapper';
import { CONVERSATION_STORAGE_PORT } from '../src/domain/tokens';
import { RateLimitGuard } from '../src/adapters/driving/rest/guards/rate-limit.guard';

describe('HistoryController (e2e)', () => {
  let app: INestApplication;
  let storage: SqliteConversationDataMapper;
  let rateLimitGuard: RateLimitGuard;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    storage = moduleFixture.get<SqliteConversationDataMapper>(CONVERSATION_STORAGE_PORT);
    rateLimitGuard = moduleFixture.get<RateLimitGuard>(RateLimitGuard);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    const db = (storage as any).db as import('better-sqlite3').Database;
    db.exec('DELETE FROM messages');
    db.exec('DELETE FROM conversations');
    (rateLimitGuard as unknown as { requests: Map<string, unknown> }).requests.clear();
  });

  describe('GET /history/sessions', () => {
    it('should use authenticated user when userId is missing', () => {
      const userId = 'sessions-missing';
      return request(app.getHttpServer())
        .get('/history/sessions')
        .set('x-user-id', userId)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([]);
        });
    });

    it('should use authenticated user when userId is empty string', () => {
      const userId = 'sessions-empty';
      return request(app.getHttpServer())
        .get('/history/sessions?userId=')
        .set('x-user-id', userId)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([]);
        });
    });

    it('should return 403 when query userId does not match authenticated user', () => {
      return request(app.getHttpServer())
        .get('/history/sessions?userId=user-2')
        .set('x-user-id', 'sessions-authz')
        .expect(403);
    });

    it('should return empty array for user with no conversations', () => {
      const userId = 'sessions-empty-data';
      return request(app.getHttpServer())
        .get(`/history/sessions?userId=${userId}`)
        .set('x-user-id', userId)
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual([]);
        });
    });

    it('should return conversations for user', () => {
      const userId = 'sessions-has-data';
      const conversationId = storage.createConversation('session-1', userId);
      storage.addMessage(conversationId, 'user', 'Hello', null, Date.now());

      return request(app.getHttpServer())
        .get(`/history/sessions?userId=${userId}`)
        .set('x-user-id', userId)
        .expect(200)
        .expect((res) => {
          expect(res.body.length).toBe(1);
          expect(res.body[0].sessionId).toBe('session-1');
          expect(res.body[0].messageCount).toBe(1);
          expect(res.body[0]).toHaveProperty('updatedAt');
        });
    });

    it('should respect limit parameter', () => {
      const userId = 'sessions-limit';
      storage.createConversation('session-1', userId);
      storage.createConversation('session-2', userId);
      storage.createConversation('session-3', userId);

      return request(app.getHttpServer())
        .get(`/history/sessions?userId=${userId}&limit=2`)
        .set('x-user-id', userId)
        .expect(200)
        .expect((res) => {
          expect(res.body.length).toBe(2);
        });
    });

    it('should exclude soft-deleted conversations', () => {
      const userId = 'sessions-soft-delete';
      const id = storage.createConversation('session-1', userId);
      storage.createConversation('session-2', userId);
      storage.softDeleteConversation(id);

      return request(app.getHttpServer())
        .get(`/history/sessions?userId=${userId}`)
        .set('x-user-id', userId)
        .expect(200)
        .expect((res) => {
          expect(res.body.length).toBe(1);
          expect(res.body[0].sessionId).toBe('session-2');
        });
    });
  });

  describe('GET /history/session/:sessionId', () => {
    it('should return 404 for non-existent session', () => {
      return request(app.getHttpServer())
        .get('/history/session/nonexistent')
        .set('x-user-id', 'session-missing')
        .expect(404);
    });

    it('should return 404 for soft-deleted session', () => {
      const userId = 'session-soft-deleted';
      const id = storage.createConversation('session-1', userId);
      storage.softDeleteConversation(id);

      return request(app.getHttpServer())
        .get('/history/session/session-1')
        .set('x-user-id', userId)
        .expect(404);
    });

    it('should return 404 when session belongs to another user', () => {
      storage.createConversation('session-1', 'user-2');

      return request(app.getHttpServer())
        .get('/history/session/session-1')
        .set('x-user-id', 'user-1')
        .expect(404);
    });

    it('should return conversation with messages', () => {
      const userId = 'session-has-messages';
      const id = storage.createConversation('session-1', userId);
      storage.addMessage(id, 'user', 'Check my balance', null, Date.now());
      storage.addMessage(id, 'agent', 'Your balance is $42.50', 'balance', Date.now() + 1000);

      return request(app.getHttpServer())
        .get('/history/session/session-1')
        .set('x-user-id', userId)
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
      const userId = 'session-camel-case';
      const id = storage.createConversation('session-1', userId);
      storage.addMessage(id, 'user', 'Hello', null, Date.now());

      return request(app.getHttpServer())
        .get('/history/session/session-1')
        .set('x-user-id', userId)
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

  describe('DELETE /history/session/:sessionId', () => {
    it('should return 404 for non-existent session', () => {
      return request(app.getHttpServer())
        .delete('/history/session/nonexistent')
        .set('x-user-id', 'delete-missing')
        .expect(404);
    });

    it('should soft delete existing session', () => {
      const userId = 'delete-own-session';
      storage.createConversation('session-1', userId);

      return request(app.getHttpServer())
        .delete('/history/session/session-1')
        .set('x-user-id', userId)
        .expect(200)
        .expect((res) => {
          expect(res.body.deleted).toBe(true);
          expect(res.body.sessionId).toBe('session-1');
        })
        .then(() => {
          return request(app.getHttpServer())
            .get('/history/session/session-1')
            .set('x-user-id', userId)
            .expect(404);
        });
    });

    it('should return 404 when deleting session owned by another user', () => {
      storage.createConversation('session-1', 'user-2');

      return request(app.getHttpServer())
        .delete('/history/session/session-1')
        .set('x-user-id', 'user-1')
        .expect(404);
    });

    it('should be idempotent (delete already deleted returns 404)', () => {
      const userId = 'delete-idempotent';
      const id = storage.createConversation('session-1', userId);
      storage.softDeleteConversation(id);

      return request(app.getHttpServer())
        .delete('/history/session/session-1')
        .set('x-user-id', userId)
        .expect(404);
    });
  });
});
