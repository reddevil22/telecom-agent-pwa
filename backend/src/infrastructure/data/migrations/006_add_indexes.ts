import type { Database } from "better-sqlite3";

export function up(db: Database): void {
  db.exec(`
    -- Conversation query hot paths
    CREATE INDEX IF NOT EXISTS idx_conversations_session_user_deleted
      ON conversations(session_id, user_id, deleted_at);

    CREATE INDEX IF NOT EXISTS idx_conversations_user_deleted_updated
      ON conversations(user_id, deleted_at, updated_at);

    -- Message listing by conversation timeline
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp
      ON messages(conversation_id, timestamp);

    -- Telco data hot paths
    CREATE INDEX IF NOT EXISTS idx_telco_subscriptions_user_status_expires
      ON telco_subscriptions(user_id, status, expires_at);

    CREATE INDEX IF NOT EXISTS idx_telco_tickets_user_created
      ON telco_tickets(user_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_telco_tickets_user_status_updated
      ON telco_tickets(user_id, status, updated_at);
  `);
}

export function down(db: Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_telco_tickets_user_status_updated;
    DROP INDEX IF EXISTS idx_telco_tickets_user_created;
    DROP INDEX IF EXISTS idx_telco_subscriptions_user_status_expires;
    DROP INDEX IF EXISTS idx_messages_conversation_timestamp;
    DROP INDEX IF EXISTS idx_conversations_user_deleted_updated;
    DROP INDEX IF EXISTS idx_conversations_session_user_deleted;
  `);
}
