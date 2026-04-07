import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { up as runMigration001 } from './migrations/001_initial';
import { up as runMigration002 } from './migrations/002_add_confirmation_screen_type';
import { up as runMigration003 } from './migrations/003_add_bundle_detail_screen_type';
import { up as runMigration004 } from './migrations/004_mock_telco';
import { up as runMigration005 } from './migrations/005_add_account_screen_type';

@Injectable()
export class SqliteConnectionService implements OnModuleDestroy {
  private readonly db: Database.Database;
  private readonly dbPath: string;

  constructor() {
    const dataDir = join(process.cwd(), 'data');
    // Create data directory if it doesn't exist
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = join(dataDir, 'telecom.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
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

      if (!appliedIds.has('001_initial')) {
        const transaction = this.db.transaction(() => {
          runMigration001(this.db);
          this.db
            .prepare('INSERT INTO _migrations (id) VALUES (?)')
            .run('001_initial');
        });
        transaction();
        console.log('[SQLite] Applied migration: 001_initial');
      }

      if (!appliedIds.has('002_add_confirmation_screen_type')) {
        const transaction = this.db.transaction(() => {
          runMigration002(this.db);
          this.db
            .prepare('INSERT INTO _migrations (id) VALUES (?)')
            .run('002_add_confirmation_screen_type');
        });
        transaction();
        console.log('[SQLite] Applied migration: 002_add_confirmation_screen_type');
      }

      if (!appliedIds.has('003_add_bundle_detail_screen_type')) {
        const transaction = this.db.transaction(() => {
          runMigration003(this.db);
          this.db
            .prepare('INSERT INTO _migrations (id) VALUES (?)')
            .run('003_add_bundle_detail_screen_type');
        });
        transaction();
        console.log('[SQLite] Applied migration: 003_add_bundle_detail_screen_type');
      }

      if (!appliedIds.has('004_mock_telco')) {
        const transaction = this.db.transaction(() => {
          runMigration004(this.db);
          this.db
            .prepare('INSERT INTO _migrations (id) VALUES (?)')
            .run('004_mock_telco');
        });
        transaction();
        console.log('[SQLite] Applied migration: 004_mock_telco');
      }

      if (!appliedIds.has('005_add_account_screen_type')) {
        const transaction = this.db.transaction(() => {
          runMigration005(this.db);
          this.db
            .prepare('INSERT INTO _migrations (id) VALUES (?)')
            .run('005_add_account_screen_type');
        });
        transaction();
        console.log('[SQLite] Applied migration: 005_add_account_screen_type');
      }
    } catch (error) {
      console.error('[SQLite] Migration failed:', error);
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
