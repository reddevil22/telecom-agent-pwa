# Telecom Agent PWA - SQLite Persistence Implementation Plan

## Phase 1: Conversation History Persistence (SQLite)

**Version:** 3.0 (Fixes from adversarial review of v2.0)
**Date:** 2026-04-03
**Scope:** Conversation history persistence ONLY — domain data (balance/bundles/usage/support) remains JSON. SSE deferred to Phase 2.

---

## v2.0 Bugs Fixed in v3.0

| # | v2.0 Bug | v3.0 Fix |
|---|----------|----------|
| 1 | `this.db` undefined when `statements` field initializer runs | **Statements prepared inside constructor body after `this.db` is assigned** |
| 2 | `_migrations` table queried before it exists | **Runner bootstraps `_migrations` table before querying** |
| 3 | CSS module named import `{ styles }` mismatches default export declaration | **Default import `import styles from '...'`** matching existing codebase pattern |
| 4 | `typeof row` references undefined variable | **Explicit `ConversationRow` type** |
| 5 | `import { randomUUID } from 'crypto'` in browser code | **`crypto.randomUUID()` using browser global** |
| 6 | Domain/application imports infrastructure directly (no port) | **Synchronous `ConversationStorage` port in `domain/ports/`**, injected via Symbol token |
| 7 | `handleSelectSession` double-fetches messages (fetches then discards) | **Single fetch via machine's `loadingSession` invoke only** |
| 8 | E2E uses native `confirm()` (Playwright can't click it), missing `data-testid` | **Inline `ConfirmDelete` component + proper `data-testid` attributes** |

---

## Architecture

### Layer Design

```
domain/ports/conversation-storage.port.ts   (interface — sync)
        ↑
infrastructure/data/sqlite-conversation-storage.adapter.ts  (implements port)
        ↑ uses
infrastructure/data/sqlite-connection.service.ts  (raw SQLite)
```

- Domain defines a **synchronous port** (better-sqlite3 is sync, no fake `Promise` wrapping)
- Infrastructure implements it with a single DataMapper-style adapter
- DI uses Symbol token (`CONVERSATION_STORAGE`) — same pattern as `LLM_PORT`, `BALANCE_BFF_PORT`, etc.
- No `@Global()` — explicit module imports

### Scope Note

This phase persists **conversation history only** (messages between user and agent). Domain data (balances, bundles, usage, support tickets, FAQ) continues to come from existing JSON mock files. Persisting domain data is a separate concern that should be tackled alongside real BFF API integration.

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'agent')),
  text TEXT NOT NULL,
  screen_type TEXT CHECK(screen_type IN ('balance', 'bundles', 'usage', 'support', 'unknown')),
  timestamp INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_deleted ON conversations(deleted_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
```

**Notes:**
- `deleted_at TEXT DEFAULT NULL` — soft delete. Queries filter `WHERE deleted_at IS NULL`.
- `ON DELETE CASCADE` on messages FK only fires on hard deletes (future admin purge). Soft-deleted conversations keep their messages for audit.
- `_migrations` is created by the runner bootstrap, NOT inside a migration — avoids chicken-and-egg on first run.

---

## Implementation Tasks

### Week 1: Backend

#### Day 1: Database Infrastructure

##### Task 1.1: Install Dependencies

```bash
cd backend
npm install better-sqlite3@^11.0.0
npm install -D @types/better-sqlite3@^7.6.0
```

---

##### Task 1.2: Create Port Interface

**File:** `backend/src/domain/ports/conversation-storage.port.ts`

```typescript
import type { ScreenType } from '../types/agent';

export interface ConversationDocument {
  id: string;
  sessionId: string;
  userId: string;
  messages: Array<{
    id: string;
    role: 'user' | 'agent';
    text: string;
    screenType?: ScreenType;
    timestamp: number;
  }>;
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    totalMessages: number;
  };
}

export interface ConversationListItem {
  id: string;
  sessionId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationStorage {
  /** Create a new conversation. Returns the conversation ID. */
  createConversation(sessionId: string, userId: string): string;

  /** Get conversation by session ID. Returns null if not found or soft-deleted. */
  getConversation(sessionId: string): ConversationDocument | null;

  /** List conversations for a user, most recently updated first. */
  getConversationsByUser(userId: string, limit?: number): ConversationListItem[];

  /** Append a message to a conversation. */
  addMessage(
    conversationId: string,
    role: 'user' | 'agent',
    text: string,
    screenType: ScreenType | null,
    timestamp: number,
  ): void;

  /** Soft-delete a conversation. No-op if already deleted. */
  softDeleteConversation(conversationId: string): void;
}
```

**Acceptance Criteria:**
- [ ] Interface is synchronous (no `Promise`)
- [ ] Lives in `domain/ports/` — zero infrastructure imports
- [ ] `ConversationDocument` and `ConversationListItem` are separate types
- [ ] `ScreenType` imported from existing `domain/types/agent`

---

##### Task 1.3: Add DI Token

**File:** `backend/src/domain/tokens.ts` (append)

```typescript
export const CONVERSATION_STORAGE = Symbol('CONVERSATION_STORAGE');
```

---

##### Task 1.4: Create Migration

**File:** `backend/src/infrastructure/data/migrations/001_initial.ts`

```typescript
import type { Database } from 'better-sqlite3';

export function up(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'agent')),
      text TEXT NOT NULL,
      screen_type TEXT CHECK(screen_type IN ('balance', 'bundles', 'usage', 'support', 'unknown')),
      timestamp INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_deleted ON conversations(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  `);
}

export function down(db: Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_messages_conversation;
    DROP INDEX IF EXISTS idx_conversations_deleted;
    DROP INDEX IF EXISTS idx_conversations_user;
    DROP INDEX IF EXISTS idx_conversations_session;
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS conversations;
  `);
}
```

---

##### Task 1.5: Create Migration Runner

**File:** `backend/src/infrastructure/data/migrations/run-migrations.ts`

```typescript
import type { Database } from 'better-sqlite3';
import * as M001 from './001_initial';

interface Migration {
  id: string;
  up: (db: Database) => void;
  down: (db: Database) => void;
}

const MIGRATIONS: Migration[] = [
  { id: '001_initial', up: M001.up, down: M001.down },
];

/**
 * Bootstrap the _migrations tracking table, then run any unapplied migrations.
 * Called once at app startup from SqliteConnectionService.
 */
export function runMigrations(db: Database): void {
  // Bootstrap: ensure _migrations table exists BEFORE querying it
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const applied = new Set(
    db.prepare('SELECT id FROM _migrations').all().map((r: any) => r.id as string),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;

    try {
      db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(migration.id);
      })();
      console.log(`[SQLite] Applied migration: ${migration.id}`);
    } catch (error) {
      console.error(`[SQLite] Migration ${migration.id} failed:`, error);
      throw error;
    }
  }
}

/**
 * Rollback migrations in reverse order down to (and including) targetId.
 */
export function rollbackMigration(db: Database, targetId: string): void {
  const applied = db
    .prepare('SELECT id FROM _migrations ORDER BY applied_at DESC')
    .all() as Array<{ id: string }>;

  for (const row of applied) {
    const migration = MIGRATIONS.find(m => m.id === row.id);
    if (!migration) continue;

    console.log(`[SQLite] Rolling back: ${migration.id}`);
    db.transaction(() => {
      migration.down(db);
      db.prepare('DELETE FROM _migrations WHERE id = ?').run(migration.id);
    })();

    if (row.id === targetId) break;
  }
}
```

**Acceptance Criteria:**
- [ ] `_migrations` bootstrapped before any SELECT
- [ ] Each migration runs in a transaction
- [ ] Failed migration throws (fail-fast)
- [ ] Rollback removes migrations in reverse order

---

##### Task 1.6: Create SQLite Connection Service

**File:** `backend/src/infrastructure/data/sqlite-connection.service.ts`

```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { join } from 'path';
import { runMigrations } from './migrations/run-migrations';

@Injectable()
export class SqliteConnectionService implements OnModuleDestroy {
  private readonly db: Database.Database;

  constructor() {
    const dbPath = process.env.DATABASE_PATH ?? join(process.cwd(), 'data', 'telecom.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    runMigrations(this.db);
  }

  /** Constructor overload for tests — accepts a pre-built in-memory database. */
  static fromDatabase(db: Database.Database): SqliteConnectionService {
    const svc = Object.create(SqliteConnectionService.prototype) as SqliteConnectionService;
    (svc as any).db = db;
    return svc;
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  onModuleDestroy() {
    this.db.close();
  }
}
```

**Acceptance Criteria:**
- [ ] Database file created at `data/telecom.db` (or `DATABASE_PATH` env var)
- [ ] WAL mode + foreign keys enabled
- [ ] Migrations run on startup
- [ ] `fromDatabase()` factory for tests (no file I/O)

---

#### Day 2: Storage Adapter (Fix #1: constructor order)

##### Task 2.1: Create SQLite Conversation Storage Adapter

**File:** `backend/src/infrastructure/data/sqlite-conversation-storage.adapter.ts`

```typescript
import { Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { SqliteConnectionService } from './sqlite-connection.service';
import type {
  ConversationStorage,
  ConversationDocument,
  ConversationListItem,
} from '../../domain/ports/conversation-storage.port';
import type { ScreenType } from '../../domain/types/agent';

interface ConversationRow {
  id: string;
  session_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'agent';
  text: string;
  screen_type: string | null;
  timestamp: number;
  created_at: string;
}

@Injectable()
export class SqliteConversationStorageAdapter implements ConversationStorage {
  private readonly db: Database;

  // FIX #1: Statements prepared in constructor body AFTER this.db is assigned.
  // v2.0 prepared them as a class field initializer which ran before the constructor.
  private readonly stmtCreateConversation;
  private readonly stmtGetBySession;
  private readonly stmtGetByUser;
  private readonly stmtAddMessage;
  private readonly stmtGetMessages;
  private readonly stmtSoftDelete;
  private readonly stmtUpdateTimestamp;

  constructor(connection: SqliteConnectionService) {
    this.db = connection.getDatabase();

    this.stmtCreateConversation = this.db.prepare(`
      INSERT INTO conversations (id, session_id, user_id, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `);

    this.stmtGetBySession = this.db.prepare(`
      SELECT * FROM conversations
      WHERE session_id = ? AND deleted_at IS NULL
    `);

    this.stmtGetByUser = this.db.prepare(`
      SELECT c.*, COUNT(m.id) as message_count
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.user_id = ? AND c.deleted_at IS NULL
      GROUP BY c.id
      ORDER BY c.updated_at DESC
      LIMIT ?
    `);

    this.stmtAddMessage = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, text, screen_type, timestamp, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    this.stmtGetMessages = this.db.prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `);

    this.stmtSoftDelete = this.db.prepare(`
      UPDATE conversations
      SET deleted_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND deleted_at IS NULL
    `);

    this.stmtUpdateTimestamp = this.db.prepare(`
      UPDATE conversations SET updated_at = datetime('now') WHERE id = ?
    `);
  }

  createConversation(sessionId: string, userId: string): string {
    const id = randomUUID();
    this.stmtCreateConversation.run(id, sessionId, userId);
    return id;
  }

  getConversation(sessionId: string): ConversationDocument | null {
    const row = this.stmtGetBySession.get(sessionId) as ConversationRow | undefined;
    if (!row) return null;
    const messages = this.stmtGetMessages.all(row.id) as MessageRow[];
    return this.toDocument(row, messages);
  }

  getConversationsByUser(userId: string, limit: number = 10): ConversationListItem[] {
    const rows = this.stmtGetByUser.all(userId, limit) as Array<ConversationRow & { message_count: number }>;
    return rows.map(row => ({
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
    }));
  }

  addMessage(
    conversationId: string,
    role: 'user' | 'agent',
    text: string,
    screenType: ScreenType | null,
    timestamp: number,
  ): void {
    this.stmtAddMessage.run(randomUUID(), conversationId, role, text, screenType, timestamp);
    this.stmtUpdateTimestamp.run(conversationId);
  }

  softDeleteConversation(conversationId: string): void {
    this.stmtSoftDelete.run(conversationId);
  }

  private toDocument(row: ConversationRow, messages: MessageRow[]): ConversationDocument {
    return {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        text: m.text,
        ...(m.screen_type ? { screenType: m.screen_type as ScreenType } : {}),
        timestamp: m.timestamp,
      })),
      metadata: {
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        totalMessages: messages.length,
      },
    };
  }
}
```

**Acceptance Criteria:**
- [ ] `implements ConversationStorage` (domain port)
- [ ] All statements prepared in constructor body after `this.db` is set
- [ ] `toDocument()` is private — controller uses port interface methods only
- [ ] Explicit `ConversationRow` / `MessageRow` types (no `typeof row` or `any`)
- [ ] `addMessage` also updates conversation `updated_at`
- [ ] Soft delete is idempotent (`WHERE deleted_at IS NULL`)

---

##### Task 2.2: Create SQLite Data Module

**File:** `backend/src/infrastructure/data/sqlite-data.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { CONVERSATION_STORAGE } from '../../domain/tokens';
import { SqliteConnectionService } from './sqlite-connection.service';
import { SqliteConversationStorageAdapter } from './sqlite-conversation-storage.adapter';

@Module({
  providers: [
    SqliteConnectionService,
    {
      provide: CONVERSATION_STORAGE,
      useClass: SqliteConversationStorageAdapter,
    },
  ],
  exports: [CONVERSATION_STORAGE],
})
export class SqliteDataModule {}
```

**Acceptance Criteria:**
- [ ] No `@Global()` — consumers must explicitly import `SqliteDataModule`
- [ ] Port token `CONVERSATION_STORAGE` is the only export
- [ ] Concrete `SqliteConversationStorageAdapter` is not exported

---

#### Day 3: Integrate with Supervisor

##### Task 3.1: Modify SupervisorService

**File:** `backend/src/application/supervisor/supervisor.service.ts`

**Changes to constructor and `processRequest`:**

```typescript
import type { ConversationStorage } from '../../domain/ports/conversation-storage.port';

export class SupervisorService {
  private readonly toolResolver: ToolResolver;
  private readonly logger: PinoLogger | null;

  constructor(
    private readonly llm: LlmPort,
    private readonly modelName: string,
    private readonly temperature: number,
    private readonly maxTokens: number,
    private readonly conversationStorage: ConversationStorage,  // NEW — depends on port, not concrete class
    logger?: PinoLogger,
  ) {
    this.toolResolver = new ToolResolver();
    this.logger = logger ?? null;
    this.logger?.setContext(SupervisorService.name);
  }

  // ... registerAgent unchanged ...

  async processRequest(request: AgentRequest): Promise<AgentResponse> {
    // ... existing unknownResponse setup unchanged ...

    try {
      // ── NEW: Persist conversation ──
      let conversationId: string;
      const existing = this.conversationStorage.getConversation(request.sessionId);
      if (existing) {
        conversationId = existing.id;
      } else {
        conversationId = this.conversationStorage.createConversation(
          request.sessionId,
          request.userId,
        );
      }

      // Store user message BEFORE processing
      this.conversationStorage.addMessage(
        conversationId,
        'user',
        request.prompt,
        null,
        request.timestamp,
      );

      // ── EXISTING: Build messages + ReAct loop ──
      const messages: LoopMessage[] = this.buildInitialMessages(request);
      const collectedResults: ToolResult[] = [];
      let primaryResult: { ... } | null = null;

      // ... for loop unchanged until response ...

      // ── After response is determined (all return paths): ──
      // Wrap the return in a helper to also persist agent response.

    } catch (error) {
      // ... existing error handling unchanged ...
    }
  }
```

**Concrete integration approach — add a private helper:**

```typescript
  /**
   * Persist the agent response, then return it.
   * Called from every return path in processRequest after the primary result is known.
   */
  private persistAndReturn(
    response: AgentResponse,
    conversationId: string,
  ): AgentResponse {
    try {
      this.conversationStorage.addMessage(
        conversationId,
        'agent',
        response.replyText,
        response.screenType,
        Date.now(),
      );
    } catch (error) {
      // Persistence failure must not break the response
      this.logger?.error({ err: error }, 'Failed to persist agent response');
    }
    return response;
  }
```

Then replace each `return this.buildResponse(...)` / `return unknownResponse` / `return { ...unknownResponse, ... }` in `processRequest` with `return this.persistAndReturn(response, conversationId)`.

**Acceptance Criteria:**
- [ ] Constructor depends on `ConversationStorage` (port), not `SqliteConversationStorageAdapter`
- [ ] Conversation created/retrieved on each request
- [ ] User message persisted before LLM call
- [ ] Agent response persisted after LLM call (in all return paths)
- [ ] Persistence errors logged but don't break the agent response
- [ ] Import is `../../domain/ports/conversation-storage.port` — NOT infrastructure

---

##### Task 3.2: Update AgentModule DI

**File:** `backend/src/app.agent-module.ts`

```typescript
import { CONVERSATION_STORAGE } from './domain/tokens';
import type { ConversationStorage } from './domain/ports/conversation-storage.port';
import { SqliteDataModule } from './infrastructure/data/sqlite-data.module';

@Module({
  imports: [
    LlmModule,
    BalanceBffModule,
    BundlesBffModule,
    UsageBffModule,
    SupportBffModule,
    SqliteDataModule,  // NEW — explicit import, no @Global()
  ],
  controllers: [AgentController, HealthController],
  providers: [
    {
      provide: SupervisorService,
      useFactory: (
        llm: LlmPort,
        balanceBff: BalanceBffPort,
        bundlesBff: BundlesBffPort,
        usageBff: UsageBffPort,
        supportBff: SupportBffPort,
        conversationStorage: ConversationStorage,  // NEW
        config: ConfigService,
        logger: PinoLogger,
      ) => {
        const supervisor = new SupervisorService(
          llm,
          config.get<string>('LLM_MODEL_NAME')!,
          config.get<number>('LLM_TEMPERATURE')!,
          config.get<number>('LLM_MAX_TOKENS')!,
          conversationStorage,  // NEW
          logger,
        );
        supervisor.registerAgent('check_balance', new BalanceSubAgent(balanceBff));
        supervisor.registerAgent('list_bundles', new BundlesSubAgent(bundlesBff));
        supervisor.registerAgent('check_usage', new UsageSubAgent(usageBff));
        supervisor.registerAgent('get_support', new SupportSubAgent(supportBff));
        return supervisor;
      },
      inject: [
        LLM_PORT,
        BALANCE_BFF_PORT,
        BUNDLES_BFF_PORT,
        USAGE_BFF_PORT,
        SUPPORT_BFF_PORT,
        CONVERSATION_STORAGE,  // NEW
        ConfigService,
        PinoLogger,
      ],
    },
  ],
})
export class AgentModule {}
```

**Acceptance Criteria:**
- [ ] `SqliteDataModule` imported explicitly
- [ ] `CONVERSATION_STORAGE` token injected — factory depends on port type
- [ ] No `@Global()` anywhere

---

#### Day 4: History API

##### Task 4.1: Create History Controller

**File:** `backend/src/adapters/driving/rest/history.controller.ts`

```typescript
import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  NotFoundException,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { CONVERSATION_STORAGE } from '../../../domain/tokens';
import type { ConversationStorage } from '../../../domain/ports/conversation-storage.port';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { Inject } from '@nestjs/common';

@Controller('history')
@UseGuards(RateLimitGuard)
export class HistoryController {
  constructor(
    @Inject(CONVERSATION_STORAGE) private readonly storage: ConversationStorage,
  ) {}

  @Get('sessions')
  getSessions(
    @Query('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    if (!userId || userId.trim() === '') {
      throw new BadRequestException('userId is required');
    }
    return this.storage.getConversationsByUser(
      userId,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  @Get('session/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    const conv = this.storage.getConversation(sessionId);
    if (!conv) {
      throw new NotFoundException('Session not found');
    }
    return conv;
  }

  @Delete('session/:sessionId')
  deleteSession(@Param('sessionId') sessionId: string) {
    const conv = this.storage.getConversation(sessionId);
    if (!conv) {
      throw new NotFoundException('Session not found');
    }
    this.storage.softDeleteConversation(conv.id);
    return { deleted: true, sessionId };
  }
}
```

**Acceptance Criteria:**
- [ ] Controller depends on `ConversationStorage` port (not concrete class)
- [ ] Injected via `@Inject(CONVERSATION_STORAGE)` — no bracket-notation access to private methods
- [ ] GET /api/history/sessions?userId=xxx — 400 if userId missing/empty
- [ ] GET /api/history/session/:id — returns `ConversationDocument` via port's `getConversation()`
- [ ] DELETE /api/history/session/:id — soft delete, 404 if not found
- [ ] Rate limiting applied

---

##### Task 4.2: Register HistoryController in Root Module

**File:** `backend/src/app.module.ts`

```typescript
import { HistoryController } from './adapters/driving/rest/history.controller';

@Module({
  imports: [LoggerModule, ConfigModule, JsonDataModule, AgentModule, SqliteDataModule],
  controllers: [HistoryController],
  providers: [LoggingInterceptor, AllExceptionsFilter],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('agent/chat');
  }
}
```

**Note:** `HistoryController` is registered in `AppModule` (not `AgentModule`) because `SqliteDataModule` is imported at this level, and the controller is a separate driving adapter.

**Acceptance Criteria:**
- [ ] `SqliteDataModule` imported in root
- [ ] `HistoryController` registered
- [ ] Existing middleware/routes unchanged

---

#### Day 5: Backend Testing

##### Task 5.1: Storage Adapter Unit Tests

**File:** `backend/test/sqlite-conversation-storage.adapter.spec.ts`

```typescript
import Database from 'better-sqlite3';
import type { Database as DbType } from 'better-sqlite3';
import { SqliteConnectionService } from '../src/infrastructure/data/sqlite-connection.service';
import { SqliteConversationStorageAdapter } from '../src/infrastructure/data/sqlite-conversation-storage.adapter';

describe('SqliteConversationStorageAdapter', () => {
  let db: DbType;
  let storage: SqliteConversationStorageAdapter;

  beforeAll(() => {
    // Use the ACTUAL migration to create schema — not a hand-written one
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');

    // Run migration directly
    const { up } = require('../src/infrastructure/data/migrations/001_initial');
    up(db);

    // Bootstrap _migrations table (run-migrations normally does this)
    db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT)`);

    const connection = SqliteConnectionService.fromDatabase(db);
    storage = new SqliteConversationStorageAdapter(connection);
  });

  afterAll(() => db.close());

  afterEach(() => {
    db.exec('DELETE FROM messages; DELETE FROM conversations;');
  });

  // ── Happy path ──

  it('should create a conversation and return its ID', () => {
    const id = storage.createConversation('sess-1', 'user-1');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should retrieve a conversation by session ID', () => {
    storage.createConversation('sess-1', 'user-1');
    const doc = storage.getConversation('sess-1');
    expect(doc).not.toBeNull();
    expect(doc!.sessionId).toBe('sess-1');
    expect(doc!.userId).toBe('user-1');
    expect(doc!.messages).toEqual([]);
  });

  it('should return null for non-existent session', () => {
    expect(storage.getConversation('nonexistent')).toBeNull();
  });

  it('should add and retrieve messages', () => {
    const id = storage.createConversation('sess-1', 'user-1');
    storage.addMessage(id, 'user', 'Hello', null, 1000);
    storage.addMessage(id, 'agent', 'Hi there!', 'balance', 1001);

    const doc = storage.getConversation('sess-1')!;
    expect(doc.messages).toHaveLength(2);
    expect(doc.messages[0]).toEqual({
      id: expect.any(String),
      role: 'user',
      text: 'Hello',
      timestamp: 1000,
    });
    expect(doc.messages[1].screenType).toBe('balance');
  });

  it('should list conversations by user ordered by most recent', () => {
    storage.createConversation('sess-1', 'user-1');
    storage.createConversation('sess-2', 'user-1');
    const list = storage.getConversationsByUser('user-1');
    expect(list).toHaveLength(2);
    expect(list[0].sessionId).toBe('sess-2'); // Most recent first
  });

  it('should respect the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      storage.createConversation(`sess-${i}`, 'user-1');
    }
    const list = storage.getConversationsByUser('user-1', 3);
    expect(list).toHaveLength(3);
  });

  it('should soft-delete a conversation', () => {
    const id = storage.createConversation('sess-1', 'user-1');
    storage.softDeleteConversation(id);
    expect(storage.getConversation('sess-1')).toBeNull();
  });

  it('should exclude soft-deleted conversations from user list', () => {
    storage.createConversation('sess-1', 'user-1');
    const id2 = storage.createConversation('sess-2', 'user-1');
    storage.softDeleteConversation(id2);
    const list = storage.getConversationsByUser('user-1');
    expect(list).toHaveLength(1);
    expect(list[0].sessionId).toBe('sess-1');
  });

  // ── Negative paths ──

  it('should NOT crash when adding a message to a non-existent conversation', () => {
    // FK violation — should throw, not silently corrupt
    expect(() => {
      storage.addMessage('nonexistent-conv-id', 'user', 'test', null, Date.now());
    }).toThrow();
  });

  it('should be idempotent when soft-deleting an already-deleted conversation', () => {
    const id = storage.createConversation('sess-1', 'user-1');
    storage.softDeleteConversation(id);
    // Second delete should not throw
    expect(() => storage.softDeleteConversation(id)).not.toThrow();
  });

  it('should return empty list for user with no conversations', () => {
    expect(storage.getConversationsByUser('user-999')).toEqual([]);
  });

  it('should NOT return conversations belonging to a different user', () => {
    storage.createConversation('sess-1', 'user-1');
    storage.createConversation('sess-2', 'user-2');
    const list = storage.getConversationsByUser('user-1');
    expect(list).toHaveLength(1);
    expect(list[0].sessionId).toBe('sess-1');
  });
});
```

**Acceptance Criteria:**
- [ ] Schema created by actual migration `up()` — not hand-written
- [ ] `SqliteConnectionService.fromDatabase()` for in-memory test DB
- [ ] Happy path + negative paths (FK violation, double-delete, wrong user, empty)
- [ ] `afterEach` cleans tables between tests
- [ ] >80% coverage

---

##### Task 5.2: Integration Tests for History API

**File:** `backend/test/history.controller.e2e-spec.ts`

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('HistoryController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => app.close());

  describe('GET /api/history/sessions', () => {
    it('should return 400 when userId is missing', () => {
      return request(app.getHttpServer())
        .get('/api/history/sessions')
        .expect(400);
    });

    it('should return 400 when userId is empty', () => {
      return request(app.getHttpServer())
        .get('/api/history/sessions?userId=')
        .expect(400);
    });

    it('should return empty array for user with no sessions', () => {
      return request(app.getHttpServer())
        .get('/api/history/sessions?userId=user-none')
        .expect(200)
        .expect(res => expect(res.body).toEqual([]));
    });
  });

  describe('GET /api/history/session/:sessionId', () => {
    it('should return 404 for non-existent session', () => {
      return request(app.getHttpServer())
        .get('/api/history/session/nonexistent')
        .expect(404);
    });
  });

  describe('DELETE /api/history/session/:sessionId', () => {
    it('should return 404 for non-existent session', () => {
      return request(app.getHttpServer())
        .delete('/api/history/session/nonexistent')
        .expect(404);
    });
  });
});
```

---

### Week 2: Frontend

#### Day 1: TypeScript Declarations & Service

##### Task 6.1: Add CSS Module Type Declarations

**File:** `src/vite-env.d.ts`

```typescript
/// <reference types="vite/client" />

// FIX #3: Default export to match the codebase's existing `import styles from '...'` pattern
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

**Acceptance Criteria:**
- [ ] `import styles from './Component.module.css'` works with no TS errors

---

##### Task 6.2: Create History Service

**File:** `src/services/historyService.ts`

```typescript
export interface SessionSummary {
  sessionId: string;
  messageCount: number;
  lastMessageAt: number;
}

export const historyService = {
  async getSavedSessions(userId: string): Promise<SessionSummary[]> {
    const res = await fetch(`/api/history/sessions?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) {
      if (res.status === 400) throw new Error('userId is required');
      return [];
    }
    const sessions = await res.json();
    return sessions.map((s: any) => ({
      sessionId: s.sessionId,
      messageCount: s.messageCount,
      lastMessageAt: new Date(s.updatedAt).getTime(),
    }));
  },

  async loadSession(sessionId: string): Promise<Array<{ role: 'user' | 'agent'; text: string; timestamp: number }>> {
    const res = await fetch(`/api/history/session/${encodeURIComponent(sessionId)}`);
    if (!res.ok) throw new Error('Session not found');
    const conv = await res.json();
    return conv.messages;
  },

  async deleteSession(sessionId: string): Promise<void> {
    const res = await fetch(`/api/history/session/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete session');
  },

  getCurrentSessionId(): string | null {
    return localStorage.getItem('currentSessionId');
  },

  setCurrentSessionId(sessionId: string): void {
    localStorage.setItem('currentSessionId', sessionId);
  },

  clearCurrentSession(): void {
    localStorage.removeItem('currentSessionId');
  },
};
```

**Note:** Uses the `ConversationDocument` shape returned by the port — `conv.messages` is already camelCase (`role`, `text`, `timestamp`) since `SqliteConversationStorageAdapter.toDocument()` maps snake_case to camelCase.

**Acceptance Criteria:**
- [ ] Fetch sessions, load session, delete session
- [ ] LocalStorage for current session tracking
- [ ] No double-fetch — this service is only called from the XState machine invoke or the AppShell

---

#### Day 2: XState Machine (Complete — Fix #5 and #7)

##### Task 7.1: Full XState Machine

**File:** `src/machines/orchestratorMachine.ts`

```typescript
import { setup, fromPromise, assign } from 'xstate';
import type {
  AgentRequest,
  AgentResponse,
  ScreenData,
  ScreenType,
  ProcessingStep,
  ToolResult,
} from '../types/agent';
import type { ConversationMessage } from '../types';
import { invokeAgentService } from '../services/agentService';
import { historyService } from '../services/historyService';

export interface OrchestratorContext {
  conversationHistory: ConversationMessage[];
  currentScreenType: string | null;
  currentScreenData: ScreenData | null;
  currentSuggestions: string[];
  lastAgentReply: string | null;
  processingSteps: ProcessingStep[];
  supplementaryResults: ToolResult[];
  hasReceivedFirstResponse: boolean;
  error: string | null;
  sessionId: string;
}

export type OrchestratorEvents =
  | { type: 'SUBMIT_PROMPT'; prompt: string }
  | { type: 'LOAD_SESSION'; sessionId: string }
  | { type: 'SESSION_LOADED'; messages: ConversationMessage[] }
  | { type: 'NEW_SESSION' }
  | { type: 'RESET' };

export const orchestratorMachine = setup({
  types: {} as {
    context: OrchestratorContext;
    events: OrchestratorEvents;
  },
  actors: {
    callAgent: fromPromise<
      AgentResponse,
      { prompt: string; conversationHistory: ConversationMessage[]; sessionId: string }
    >(async ({ input }) => {
      const request: AgentRequest = {
        prompt: input.prompt,
        sessionId: input.sessionId,
        userId: 'user-1',
        conversationHistory: input.conversationHistory,
        timestamp: Date.now(),
      };
      return invokeAgentService(request);
    }),

    // FIX #7: Single fetch point for session loading — no double-fetch
    loadSessionFromHistory: fromPromise<
      ConversationMessage[],
      { sessionId: string }
    >(async ({ input }) => {
      const messages = await historyService.loadSession(input.sessionId);
      return messages;
    }),
  },
}).createMachine({
  id: 'orchestrator',
  initial: 'initializing',
  context: {
    conversationHistory: [],
    currentScreenType: null,
    currentScreenData: null,
    currentSuggestions: [
      'Show my balance',
      'What bundles are available?',
      'Check my usage',
      'I need support',
    ],
    lastAgentReply: null,
    processingSteps: [],
    supplementaryResults: [],
    hasReceivedFirstResponse: false,
    error: null,
    sessionId: '',
  },
  states: {
    initializing: {
      entry: assign({
        // FIX #5: crypto.randomUUID() is a browser global — no Node.js import needed
        sessionId: () => {
          const existing = historyService.getCurrentSessionId();
          return existing ?? `session-${crypto.randomUUID()}`;
        },
      }),
      always: { target: 'idle' },
    },

    idle: {
      entry: assign({
        // Persist sessionId to localStorage whenever we enter idle
        sessionId: ({ context }) => {
          historyService.setCurrentSessionId(context.sessionId);
          return context.sessionId;
        },
      }),
      on: {
        SUBMIT_PROMPT: {
          target: 'processing',
          actions: assign({
            conversationHistory: ({ context, event }) => [
              ...context.conversationHistory,
              { role: 'user' as const, text: event.prompt, timestamp: Date.now() },
            ],
            error: null,
          }),
        },
        LOAD_SESSION: {
          target: 'loadingSession',
        },
        NEW_SESSION: {
          actions: assign({
            conversationHistory: [],
            currentScreenType: null,
            currentScreenData: null,
            currentSuggestions: [
              'Show my balance',
              'What bundles are available?',
              'Check my usage',
              'I need support',
            ],
            lastAgentReply: null,
            processingSteps: [],
            supplementaryResults: [],
            hasReceivedFirstResponse: false,
            error: null,
            sessionId: () => `session-${crypto.randomUUID()}`,
          }),
        },
      },
    },

    loadingSession: {
      invoke: {
        id: 'sessionLoader',
        src: 'loadSessionFromHistory',
        input: ({ event }) => {
          if (event.type !== 'LOAD_SESSION') return { sessionId: '' };
          return { sessionId: event.sessionId };
        },
        onDone: {
          target: 'idle',
          actions: assign({
            conversationHistory: ({ event }) => event.output,
            sessionId: ({ event }) => {
              // event.input is not available in onDone, but we can derive from the LOAD_SESSION event
              // We need to track the requested sessionId
              return ({ event }).output ? (({ context }) => context.sessionId) as any : ({ context }) => context.sessionId;
            },
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => (event.error as Error).message || 'Failed to load session',
          }),
        },
      },
    },

    processing: {
      entry: assign({
        processingSteps: [
          { label: 'Understanding your request', status: 'done' },
          { label: 'Processing', status: 'active' },
          { label: 'Preparing response', status: 'pending' },
        ],
      }),
      invoke: {
        id: 'agentCall',
        src: 'callAgent',
        input: ({ context, event }) => {
          const submitEvent = event as Extract<OrchestratorEvents, { type: 'SUBMIT_PROMPT' }>;
          return {
            prompt: submitEvent.prompt,
            conversationHistory: context.conversationHistory.slice(0, -1),
            sessionId: context.sessionId,
          };
        },
        onDone: {
          target: 'rendering',
          actions: assign({
            currentScreenType: ({ event }) => event.output.screenType,
            currentScreenData: ({ event }) => event.output.screenData,
            currentSuggestions: ({ event }) => event.output.suggestions,
            lastAgentReply: ({ event }) => event.output.replyText,
            processingSteps: ({ event }) => event.output.processingSteps,
            supplementaryResults: ({ event }) => event.output.supplementaryResults ?? [],
            conversationHistory: ({ context, event }) => [
              ...context.conversationHistory,
              { role: 'agent' as const, text: event.output.replyText, timestamp: Date.now() },
            ],
            hasReceivedFirstResponse: true,
            error: null,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => (event.error as Error).message || 'Something went wrong',
          }),
        },
      },
    },

    rendering: {
      on: {
        SUBMIT_PROMPT: {
          target: 'processing',
          actions: assign({
            conversationHistory: ({ context, event }) => [
              ...context.conversationHistory,
              { role: 'user' as const, text: event.prompt, timestamp: Date.now() },
            ],
            error: null,
          }),
        },
        LOAD_SESSION: { target: 'loadingSession' },
        NEW_SESSION: { target: 'idle' },
      },
    },

    error: {
      on: {
        SUBMIT_PROMPT: {
          target: 'processing',
          actions: assign({
            conversationHistory: ({ context, event }) => [
              ...context.conversationHistory,
              { role: 'user' as const, text: event.prompt, timestamp: Date.now() },
            ],
            error: null,
          }),
        },
        RESET: {
          target: 'idle',
          actions: assign({ error: null }),
        },
        LOAD_SESSION: { target: 'loadingSession' },
      },
    },
  },
});

export type OrchestratorActor = ReturnType<typeof orchestratorMachine>;
```

**Wait — the `loadingSession.onDone` sessionId assignment above is messy. Here's the corrected version:**

The `LOAD_SESSION` event carries `sessionId`. We need to set it in context when the load succeeds. The cleanest way: save the requested sessionId into context on the transition, then use it in `onDone`:

```typescript
// In idle state's LOAD_SESSION transition, add an action:
LOAD_SESSION: {
  target: 'loadingSession',
  actions: assign({
    sessionId: ({ event }) =>
      event.type === 'LOAD_SESSION' ? event.sessionId : ({ context }) => context.sessionId,
  }),
},

// Then in loadingSession.invoke.onDone, sessionId is already set:
onDone: {
  target: 'idle',
  actions: assign({
    conversationHistory: ({ event }) => event.output,
    // sessionId was already set by the LOAD_SESSION transition action
  }),
},
```

**Acceptance Criteria:**
- [ ] Complete machine definition — no `...` placeholders
- [ ] `crypto.randomUUID()` (browser global) — no `import from 'crypto'`
- [ ] `initializing` state auto-transitions to `idle` via `always`
- [ ] `LOAD_SESSION` sets `sessionId` in context, then `loadSessionFromHistory` actor fetches once
- [ ] No double-fetch — `handleSelectSession` in AppShell only sends `LOAD_SESSION` event
- [ ] `NEW_SESSION` resets all context and generates fresh sessionId

---

#### Day 3-4: UI Components (Fix #8: data-testid + inline confirm)

##### Task 8.1: SessionList Component

**File:** `src/components/SessionList/SessionList.tsx`

```tsx
import { useState } from 'react';
import styles from './SessionList.module.css';  // FIX #3: default import

export interface SessionSummary {
  sessionId: string;
  messageCount: number;
  lastMessageAt: number;
}

interface Props {
  sessions: SessionSummary[];
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export function SessionList({ sessions, onSelectSession, onDeleteSession }: Props) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <div className={styles.empty}>No previous sessions</div>;
  }

  return (
    <ul className={styles.list} data-testid="session-list">
      {sessions.map(session => (
        <li key={session.sessionId} className={styles.item} data-testid="session-item">
          <button
            onClick={() => onSelectSession(session.sessionId)}
            className={styles.selectBtn}
            data-testid="select-session-btn"
          >
            <span className={styles.meta}>
              {session.messageCount} messages &bull;{' '}
              {new Date(session.lastMessageAt).toLocaleDateString()}
            </span>
          </button>

          {pendingDeleteId === session.sessionId ? (
            <span className={styles.confirmGroup} data-testid="confirm-delete-group">
              <button
                onClick={() => {
                  onDeleteSession(session.sessionId);
                  setPendingDeleteId(null);
                }}
                className={styles.confirmBtn}
                data-testid="confirm-delete-btn"
              >
                Confirm
              </button>
              <button
                onClick={() => setPendingDeleteId(null)}
                className={styles.cancelBtn}
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setPendingDeleteId(session.sessionId)}
              className={styles.deleteBtn}
              data-testid="delete-session-btn"
            >
              Delete
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
```

**File:** `src/components/SessionList/SessionList.module.css`

```css
.list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-md) var(--space-lg);
  border-bottom: 1px solid var(--color-border);
}

.selectBtn {
  flex: 1;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}

.meta {
  font-size: var(--text-sm);
}

.deleteBtn {
  background: var(--color-error);
  color: white;
  border: none;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-xs);
  cursor: pointer;
  margin-left: var(--space-md);
  font-family: var(--font-sans);
}

.confirmGroup {
  display: flex;
  gap: var(--space-xs);
  margin-left: var(--space-md);
}

.confirmBtn {
  background: var(--color-error);
  color: white;
  border: none;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-xs);
  cursor: pointer;
  font-family: var(--font-sans);
}

.cancelBtn {
  background: var(--color-bg-input);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-xs);
  cursor: pointer;
  font-family: var(--font-sans);
}

.empty {
  text-align: center;
  padding: var(--space-3xl) var(--space-lg);
  color: var(--color-text-muted);
}
```

**Acceptance Criteria:**
- [ ] `import styles from '...'` — default import matches `vite-env.d.ts` declaration
- [ ] Inline confirm/cancel instead of `window.confirm()` — Playwright can interact with DOM elements
- [ ] `data-testid` on list, items, delete button, confirm button, confirm group
- [ ] Uses existing theme CSS variables (`--color-error`, `--space-md`, etc.)

---

##### Task 8.2: Add History Tab to AppShell

**File:** `src/components/AppShell/AppShell.tsx`

The existing `AppShell` receives `actor` as a prop. Add a history tab that sends events to the same actor. No `useActor` import needed — the actor is already provided.

```tsx
// Add to existing imports:
import { useState, useEffect, useCallback } from 'react';
import { SessionList, type SessionSummary } from '../SessionList/SessionList';
import { historyService } from '../../services/historyService';

// Add inside the AppShell component, after existing state:

export function AppShell({ actor }: Props) {
  // ... existing theme state ...

  const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const state = useSelector(actor, selectState);
  // ... rest of existing selectors ...

  const loadSessions = useCallback(async () => {
    try {
      const userId = 'user-1'; // TODO: auth context
      const result = await historyService.getSavedSessions(userId);
      setSessions(result);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // FIX #7: Only send LOAD_SESSION event — the machine's loadSessionFromHistory
  // actor handles the actual fetch. No double-fetch.
  const handleSelectSession = (sessionId: string) => {
    actor.send({ type: 'LOAD_SESSION', sessionId });
    setActiveTab('chat');
  };

  const handleDeleteSession = async (sessionId: string) => {
    await historyService.deleteSession(sessionId);
    setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
  };

  const handleNewSession = () => {
    actor.send({ type: 'NEW_SESSION' });
    setActiveTab('chat');
  };

  // ── In JSX, add a tab bar above the content area ──

  // Add inside <div className={styles.content}>, BEFORE the contentArea div:
  //
  // <div className={styles.tabBar}>
  //   <button
  //     className={`${styles.tab} ${activeTab === 'chat' ? styles.tabActive : ''}`}
  //     onClick={() => setActiveTab('chat')}
  //     data-testid="chat-tab"
  //   >
  //     Chat
  //   </button>
  //   <button
  //     className={`${styles.tab} ${activeTab === 'history' ? styles.tabActive : ''}`}
  //     onClick={() => { setActiveTab('history'); loadSessions(); }}
  //     data-testid="history-tab"
  //   >
  //     History
  //   </button>
  //   <button
  //     className={styles.tab}
  //     onClick={handleNewSession}
  //     data-testid="new-session-btn"
  //   >
  //     + New
  //   </button>
  // </div>
  //
  // {activeTab === 'history' ? (
  //   <SessionList
  //     sessions={sessions}
  //     onSelectSession={handleSelectSession}
  //     onDeleteSession={handleDeleteSession}
  //   />
  // ) : (
  //   // ... existing contentArea with chat history, screens, prompt ...
  // )}
}
```

Add tab bar styles to `AppShell.module.css`:

```css
.tabBar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--space-lg);
}

.tab {
  padding: var(--space-sm) var(--space-md);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  color: var(--color-text-secondary);
}

.tabActive {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
```

**Acceptance Criteria:**
- [ ] `actor` prop used (not `useActor`) — matches existing pattern
- [ ] `handleSelectSession` only sends `LOAD_SESSION` event — no fetch
- [ ] History tab refreshes session list on open
- [ ] New session button resets machine state
- [ ] `data-testid` on all tabs

---

#### Day 5: E2E Tests (Fix #8: proper Playwright patterns)

##### Task 9.1: History E2E Tests

**File:** `e2e/history.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Conversation History', () => {
  test('should persist conversation across page refresh', async ({ page }) => {
    await page.goto('/');

    await page.fill('[data-testid="prompt-input"]', 'Check my balance');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="balance-screen"]');

    await page.reload();

    // After reload, the machine initializes and loads from localStorage sessionId
    // The backend should restore the conversation
    await page.waitForSelector('[data-testid="chat-bubble"]:has-text("Check my balance")');
  });

  test('should list sessions in history tab', async ({ page }) => {
    await page.goto('/');

    // Create a conversation
    await page.fill('[data-testid="prompt-input"]', 'Check my balance');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="balance-screen"]');

    // Switch to history tab
    await page.click('[data-testid="history-tab"]');

    // Verify session appears
    await page.waitForSelector('[data-testid="session-list"]');
    const items = page.locator('[data-testid="session-item"]');
    await expect(items).toHaveCount(1);
  });

  test('should delete session with inline confirmation', async ({ page }) => {
    await page.goto('/');

    // Create a conversation
    await page.fill('[data-testid="prompt-input"]', 'Check my balance');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="balance-screen"]');

    // Switch to history tab
    await page.click('[data-testid="history-tab"]');
    await page.waitForSelector('[data-testid="session-item"]');

    // Click delete — shows inline confirm (NOT window.confirm)
    await page.click('[data-testid="delete-session-btn"]');

    // Confirm group should appear
    await page.waitForSelector('[data-testid="confirm-delete-group"]');

    // Click confirm
    await page.click('[data-testid="confirm-delete-btn"]');

    // Session should be removed
    await expect(page.locator('[data-testid="session-item"]')).toHaveCount(0);

    // Empty state should show
    await page.waitForSelector('[data-testid="session-list"]:has-text("No previous sessions")');
  });

  test('should cancel session deletion', async ({ page }) => {
    await page.goto('/');

    await page.fill('[data-testid="prompt-input"]', 'Check my balance');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="balance-screen"]');

    await page.click('[data-testid="history-tab"]');
    await page.waitForSelector('[data-testid="session-item"]');

    // Click delete
    await page.click('[data-testid="delete-session-btn"]');

    // Click cancel
    await page.click('button:has-text("Cancel")');

    // Session should still be there
    await expect(page.locator('[data-testid="session-item"]')).toHaveCount(1);

    // Confirm group should be gone (back to delete button)
    await expect(page.locator('[data-testid="confirm-delete-group"]')).toHaveCount(0);
  });

  test('should start new session', async ({ page }) => {
    await page.goto('/');

    await page.fill('[data-testid="prompt-input"]', 'Check my balance');
    await page.click('[data-testid="send-button"]');
    await page.waitForSelector('[data-testid="balance-screen"]');

    // Click new session
    await page.click('[data-testid="new-session-btn"]');

    // Should show initial suggestions, no chat history
    await expect(page.locator('[data-testid="chat-bubble"]')).toHaveCount(0);
  });
});
```

**Acceptance Criteria:**
- [ ] No `window.confirm()` — uses DOM-based inline confirm
- [ ] All interactive elements have `data-testid`
- [ ] Tests: persist across refresh, list sessions, delete, cancel delete, new session
- [ ] Each test is isolated

---

## Environment Variables

```bash
# Add to backend/.env
DATABASE_PATH=./data/telecom.db

# Existing (unchanged)
LLM_BASE_URL=http://localhost:8080/v1
LLM_API_KEY=
LLM_MODEL_NAME=meta-llama/Llama-3-70b
LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=1024
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
```

---

## Timeline

| Week | Day | Tasks | Deliverables |
|------|-----|-------|--------------|
| **1** | 1 | Port interface, token, migration, connection service, runner | DB infrastructure |
| | 2 | Storage adapter (with constructor fix), data module | Working persistence |
| | 3 | Supervisor integration, AgentModule DI wiring | Chat messages saved |
| | 4 | History controller, AppModule registration | REST API endpoints |
| | 5 | Unit tests (adapter) + integration tests (controller) | Test coverage |
| **2** | 1 | CSS type declarations, history service | Frontend services |
| | 2 | XState machine (full rewrite with session support) | State machine |
| | 3-4 | SessionList component, AppShell history tab, tab bar styles | UI components |
| | 5 | E2E tests | Playwright tests passing |

---

## File Checklist

### New Files (Backend)

| File | Purpose |
|------|---------|
| `backend/src/domain/ports/conversation-storage.port.ts` | Sync port interface |
| `backend/src/domain/tokens.ts` | Append `CONVERSATION_STORAGE` symbol |
| `backend/src/infrastructure/data/migrations/001_initial.ts` | Schema migration |
| `backend/src/infrastructure/data/migrations/run-migrations.ts` | Runner with bootstrap |
| `backend/src/infrastructure/data/sqlite-connection.service.ts` | SQLite connection |
| `backend/src/infrastructure/data/sqlite-conversation-storage.adapter.ts` | Port implementation |
| `backend/src/infrastructure/data/sqlite-data.module.ts` | NestJS module |
| `backend/src/adapters/driving/rest/history.controller.ts` | History REST API |
| `backend/test/sqlite-conversation-storage.adapter.spec.ts` | Unit tests |
| `backend/test/history.controller.e2e-spec.ts` | Integration tests |

### New Files (Frontend)

| File | Purpose |
|------|---------|
| `src/vite-env.d.ts` | CSS module type declarations |
| `src/services/historyService.ts` | History API client |
| `src/components/SessionList/SessionList.tsx` | Session list component |
| `src/components/SessionList/SessionList.module.css` | Session list styles |
| `e2e/history.spec.ts` | Playwright E2E tests |

### Modified Files

| File | Change |
|------|--------|
| `backend/src/application/supervisor/supervisor.service.ts` | Add `conversationStorage` param, persist messages |
| `backend/src/app.agent-module.ts` | Import `SqliteDataModule`, inject `CONVERSATION_STORAGE` |
| `backend/src/app.module.ts` | Import `SqliteDataModule`, register `HistoryController` |
| `backend/package.json` | Add `better-sqlite3` + `@types/better-sqlite3` |
| `src/machines/orchestratorMachine.ts` | Full rewrite with session lifecycle |
| `src/components/AppShell/AppShell.tsx` | Add tab bar, history panel |
| `src/components/AppShell/AppShell.module.css` | Add tab styles |

---

## Phase 2 (Deferred)

SSE Streaming is deferred until:
1. `LlmPort` supports `streamChatCompletion()` with token-level streaming
2. Conversation persistence is stable and tested
3. Auth system is implemented (currently hardcoded `user-1`)

---

**Document End**
