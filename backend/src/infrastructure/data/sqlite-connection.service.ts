import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import { up as runMigration001 } from "./migrations/001_initial";
import { up as runMigration002 } from "./migrations/002_add_confirmation_screen_type";
import { up as runMigration003 } from "./migrations/003_add_bundle_detail_screen_type";
import { up as runMigration004 } from "./migrations/004_mock_telco";
import { up as runMigration005 } from "./migrations/005_add_account_screen_type";
import { up as runMigration006 } from "./migrations/006_add_indexes";
import { up as runMigration007 } from "./migrations/007_add_data_gift_screen_type";

type Migration = {
  id: string;
  up: (db: Database.Database) => void;
};

const MIGRATIONS: Migration[] = [
  { id: "001_initial", up: runMigration001 },
  { id: "002_add_confirmation_screen_type", up: runMigration002 },
  { id: "003_add_bundle_detail_screen_type", up: runMigration003 },
  { id: "004_mock_telco", up: runMigration004 },
  { id: "005_add_account_screen_type", up: runMigration005 },
  { id: "006_add_indexes", up: runMigration006 },
  { id: "007_add_data_gift_screen_type", up: runMigration007 },
];

@Injectable()
export class SqliteConnectionService implements OnModuleDestroy {
  private readonly logger = new Logger(SqliteConnectionService.name);
  private readonly db: Database.Database;
  private readonly dbPath: string;

  constructor() {
    const dataDir = join(process.cwd(), "data");
    // Create data directory if it doesn't exist
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = join(dataDir, "telecom.db");
    this.db = new Database(this.dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.runMigrations();
  }

  private runMigrations(): void {
    try {
      // First, create _migrations table if it doesn't exist (bootstrap)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      // Now safe to query which migrations have been applied
      const applied = this.db
        .prepare("SELECT id FROM _migrations ORDER BY applied_at")
        .all() as Array<{ id: string }>;

      const appliedIds = new Set(applied.map((r) => r.id));

      for (const migration of MIGRATIONS) {
        if (appliedIds.has(migration.id)) {
          continue;
        }

        const transaction = this.db.transaction(() => {
          migration.up(this.db);
          this.db
            .prepare("INSERT INTO _migrations (id) VALUES (?)")
            .run(migration.id);
        });

        transaction();
        this.logger.log(`[SQLite] Applied migration: ${migration.id}`);
      }
    } catch (error) {
      this.logger.error("[SQLite] Migration failed", (error as Error).stack);
      throw error;
    }
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  onModuleDestroy() {
    this.db.close();
  }
}
