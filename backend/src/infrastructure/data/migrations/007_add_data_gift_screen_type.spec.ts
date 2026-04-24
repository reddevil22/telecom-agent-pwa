import Database from "better-sqlite3";
import { up as run007, down as rollback007 } from "./007_add_data_gift_screen_type";
import { up as run001 } from "./001_initial";

describe("Migration 007_add_data_gift_screen_type", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    run001(db);
  });

  afterEach(() => {
    db.close();
  });

  it("up adds dataGift to CHECK constraint", () => {
    db.prepare("INSERT INTO conversations (id, session_id, user_id) VALUES ('c1', 's1', 'user-1')").run();
    run007(db);
    db.prepare("INSERT INTO messages (id, conversation_id, role, text, screen_type, timestamp) VALUES ('m1', 'c1', 'agent', 'hello', 'dataGift', 999)").run();
    const row = db.prepare("SELECT screen_type FROM messages WHERE id = ?").get("m1");
    expect((row as { screen_type: string }).screen_type).toBe("dataGift");
  });

  it("down removes dataGift from CHECK", () => {
    db.prepare("INSERT INTO conversations (id, session_id, user_id) VALUES ('c1', 's1', 'user-1')").run();
    run007(db);
    rollback007(db);
    expect(() => {
      db.prepare("INSERT INTO messages (id, conversation_id, role, text, screen_type, timestamp) VALUES ('m2', 'c1', 'agent', 'hello', 'dataGift', 999)").run();
    }).toThrow();
  });

  it("up preserves existing data", () => {
    db.prepare("INSERT INTO conversations (id, session_id, user_id) VALUES ('c1', 's1', 'user-1')").run();
    db.prepare("INSERT INTO messages (id, conversation_id, role, text, screen_type, timestamp) VALUES ('m3', 'c1', 'agent', 'hello', 'balance', 999)").run();
    run007(db);
    const row = db.prepare("SELECT * FROM messages WHERE id = ?").get("m3") as { id: string; screen_type: string };
    expect(row.id).toBe("m3");
    expect(row.screen_type).toBe("balance");
  });
});
