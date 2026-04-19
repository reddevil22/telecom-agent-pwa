import Database from 'better-sqlite3';
import { up, down } from './006_add_indexes';

describe('006_add_indexes migration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        deleted_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE telco_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE telco_tickets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  it('creates expected indexes idempotently', () => {
    up(db);
    up(db);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all() as Array<{ name: string }>;

    const names = indexes.map((index) => index.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'idx_conversations_session_user_deleted',
        'idx_conversations_user_deleted_updated',
        'idx_messages_conversation_timestamp',
        'idx_telco_subscriptions_user_status_expires',
        'idx_telco_tickets_user_created',
        'idx_telco_tickets_user_status_updated',
      ]),
    );
  });

  it('drops created indexes in down migration', () => {
    up(db);
    down(db);

    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;

    const names = indexes.map((index) => index.name);

    expect(names).not.toEqual(
      expect.arrayContaining([
        'idx_conversations_session_user_deleted',
        'idx_conversations_user_deleted_updated',
        'idx_messages_conversation_timestamp',
        'idx_telco_subscriptions_user_status_expires',
        'idx_telco_tickets_user_created',
        'idx_telco_tickets_user_status_updated',
      ]),
    );
  });
});
