import type { Database } from "better-sqlite3";

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE messages_new (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'agent')),
      text TEXT NOT NULL,
      screen_type TEXT CHECK(screen_type IN ('balance', 'bundles', 'bundleDetail', 'usage', 'support', 'confirmation', 'account', 'dataGift', 'unknown')),
      timestamp INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    INSERT INTO messages_new SELECT * FROM messages;

    DROP TABLE messages;
    ALTER TABLE messages_new RENAME TO messages;

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  `);
}

export function down(db: Database): void {
  db.exec(`
    CREATE TABLE messages_old (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'agent')),
      text TEXT NOT NULL,
      screen_type TEXT CHECK(screen_type IN ('balance', 'bundles', 'bundleDetail', 'usage', 'support', 'confirmation', 'account', 'unknown')),
      timestamp INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    INSERT INTO messages_old SELECT * FROM messages;
    DROP TABLE messages;
    ALTER TABLE messages_old RENAME TO messages;
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  `);
}
