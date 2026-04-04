import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  // SQLite doesn't support ALTER TABLE for CHECK constraints
  // We need to recreate the table with the updated constraint
  db.exec(`
    -- Create temporary table with updated constraint
    CREATE TABLE messages_new (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'agent')),
      text TEXT NOT NULL,
      screen_type TEXT CHECK(screen_type IN ('balance', 'bundles', 'usage', 'support', 'confirmation', 'unknown')),
      timestamp INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- Copy data from old table
    INSERT INTO messages_new SELECT * FROM messages;

    -- Drop old table and indexes
    DROP INDEX IF EXISTS idx_messages_conversation;
    DROP TABLE messages;

    -- Rename new table
    ALTER TABLE messages_new RENAME TO messages;

    -- Recreate indexes
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  `);
}

export function down(db: Database): void {
  // Revert back to the old constraint (remove confirmation)
  db.exec(`
    CREATE TABLE messages_new (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'agent')),
      text TEXT NOT NULL,
      screen_type TEXT CHECK(screen_type IN ('balance', 'bundles', 'usage', 'support', 'unknown')),
      timestamp INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    -- Copy data, converting 'confirmation' to 'unknown'
    INSERT INTO messages_new 
    SELECT id, conversation_id, role, text, 
           CASE WHEN screen_type = 'confirmation' THEN 'unknown' ELSE screen_type END,
           timestamp, created_at 
    FROM messages;

    DROP INDEX IF EXISTS idx_messages_conversation;
    DROP TABLE messages;
    ALTER TABLE messages_new RENAME TO messages;
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  `);
}
