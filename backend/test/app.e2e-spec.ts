import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect({ status: 'ok' });
  });

  it('/api/agent/chat (POST) — returns valid response even with LLM down', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/agent/chat')
      .send({
        prompt: 'show my balance',
        sessionId: 'test',
        userId: 'user-1',
        conversationHistory: [],
        timestamp: Date.now(),
      })
      .expect(201);

    expect(res.body).toHaveProperty('screenType');
    expect(res.body).toHaveProperty('screenData');
    expect(res.body).toHaveProperty('replyText');
    expect(res.body).toHaveProperty('suggestions');
    expect(res.body).toHaveProperty('confidence');
    expect(res.body).toHaveProperty('processingSteps');
  });

  it('/api/agent/chat (POST) — validates request', () => {
    return request(app.getHttpServer())
      .post('/api/agent/chat')
      .send({ prompt: 'test' })
      .expect(400);
  });
});
