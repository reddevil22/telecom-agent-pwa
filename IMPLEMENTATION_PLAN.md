# Telecom Agent PWA - Implementation Plan

## SQLite Persistence + SSE Streaming Features

**Version:** 1.0  
**Date:** 2026-04-03  
**Target:** NestJS 11 + React 19 Full-Stack PWA

---

## Executive Summary

This document outlines the implementation plan for two major enhancements to the Telecom Agent PWA:

1. **SQLite Persistence Layer** - Replace in-memory/mock data with persistent SQLite storage for conversation history and domain data
2. **Server-Sent Events (SSE) Streaming** - Real-time streaming of agent responses for improved user experience

**Estimated Effort:** 3-4 weeks  
**Risk Level:** Medium (SQLite: Low, Streaming: Medium)  
**Priority:** SQLite first (foundational), then Streaming

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Feature 1: SQLite Persistence](#feature-1-sqlite-persistence)
3. [Feature 2: SSE Streaming](#feature-2-sse-streaming)
4. [Implementation Timeline](#implementation-timeline)
5. [Testing Strategy](#testing-strategy)
6. [Risk Mitigation](#risk-mitigation)
7. [Success Criteria](#success-criteria)

---

## Current Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Vite 8 + XState v5 |
| Backend | NestJS 11 + Express 5 + TypeScript |
| Architecture | Hexagonal (Ports & Adapters) |
| Current Storage | In-memory mocks, JSON files |

### Key Architectural Patterns

- **Hexagonal Architecture**: Domain layer has zero framework dependencies
- **Symbol-based DI Tokens**: Framework-agnostic dependency injection
- **ReAct Supervisor**: LLM-driven tool selection (max 3 iterations)
- **XState State Machine**: Explicit UI states (idle → processing → rendering → error)

### Current File Structure

```
telecom-agent-pwa/
├── src/                          # Frontend (React 19)
│   ├── machines/orchestratorMachine.ts
│   ├── services/agentService.ts
│   └── components/
├── backend/src/                  # Backend (NestJS 11)
│   ├── domain/                   # Pure business logic
│   ├── application/              # Use cases (SupervisorService)
│   ├── adapters/                 # Driving (REST) + Driven (LLM, BFF)
│   └── infrastructure/           # Logging, filters, interceptors
└── backend/test/                 # Jest e2e tests
```

---

## Feature 1: SQLite Persistence

### Overview

Replace volatile in-memory storage with persistent SQLite database for:
- Conversation history (users can resume sessions)
- Domain data (balance, bundles, usage, support tickets)

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **SQLite Library** | `better-sqlite3@^11.0.0` | Synchronous API, excellent performance, native bindings |
| **Architecture Fit** | Driven adapter implementing existing ports | Maintains hexagonal architecture |
| **Migrations** | Custom lightweight runner | No heavy ORM framework needed |
| **Connection Pooling** | Not required | SQLite embedded, single connection with WAL mode |
| **Testing** | In-memory `:memory:` database | Fast, isolated tests |

### Dependencies to Add

```json
{
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

**Compatibility:**
- `better-sqlite3@11.x` requires Node.js 18+ ✓ (NestJS 11 targets ES2021)
- TypeScript 5.7.x has full type definitions ✓
- No conflicts with existing dependencies ✓

### Implementation Tasks

#### Phase 1.1: Database Infrastructure (Days 1-2)

**Task 1.1.1: Create Database Connection Service**

**File:** `backend/src/infrastructure/data/sqlite-connection.service.ts`

```typescript
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { join } from 'path';
import { runMigrations } from './migrations/run-migrations';

@Injectable()
export class SqliteConnectionService implements OnModuleDestroy {
  private readonly db: Database.Database;

  constructor(dataDir?: string) {
    const dbPath = dataDir ?? join(process.cwd(), 'data', 'telecom.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    runMigrations(this.db);
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
- [ ] Service instantiates SQLite database
- [ ] WAL mode enabled for concurrency
- [ ] Foreign keys enforced
- [ ] Migrations run on startup
- [ ] Database closed on module destroy

---

**Task 1.1.2: Create Migration Runner**

**File:** `backend/src/infrastructure/data/migrations/run-migrations.ts`

```typescript
import type { Database } from 'better-sqlite3';

const MIGRATIONS = [
  {
    id: '001_initial_schema',
    up: (db: Database) => {
      db.exec(`
        -- Conversation history
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
        
        -- Domain data
        CREATE TABLE IF NOT EXISTS balances (
          user_id TEXT PRIMARY KEY,
          current REAL NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'USD',
          last_top_up TEXT NOT NULL DEFAULT 'N/A',
          next_billing_date TEXT NOT NULL DEFAULT 'N/A'
        );
        
        CREATE TABLE IF NOT EXISTS bundles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          price REAL NOT NULL,
          currency TEXT NOT NULL,
          data_gb INTEGER NOT NULL,
          minutes INTEGER NOT NULL,
          sms INTEGER NOT NULL,
          validity TEXT NOT NULL,
          popular INTEGER DEFAULT 0
        );
        
        CREATE TABLE IF NOT EXISTS usage_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('data', 'voice', 'sms')),
          used REAL NOT NULL,
          total REAL NOT NULL,
          unit TEXT NOT NULL,
          period TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS support_tickets (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('open', 'in_progress', 'resolved')),
          subject TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS faq (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          question TEXT NOT NULL,
          answer TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS _migrations (
          id TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
        CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage_entries(user_id);
        CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON support_tickets(user_id);
      `);
    },
  },
];

export function runMigrations(db: Database): void {
  const applied = new Set(
    db.prepare("SELECT id FROM _migrations ORDER BY applied_at").all().map((r: any) => r.id),
  );

  for (const migration of MIGRATIONS) {
    if (!applied.has(migration.id)) {
      const transaction = db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(migration.id);
      });
      transaction();
      console.log(`[SQLite] Applied migration: ${migration.id}`);
    }
  }
}
```

**Acceptance Criteria:**
- [ ] All tables created with proper constraints
- [ ] Indexes created for performance
- [ ] Migration tracking table implemented
- [ ] Idempotent (safe to run multiple times)

---

**Task 1.1.3: Create SQLite Data Module**

**File:** `backend/src/infrastructure/data/sqlite-data.module.ts`

```typescript
import { Global, Module } from '@nestjs/common';
import { SqliteConnectionService } from './sqlite-connection.service';
import { ConversationRepository } from './repositories/conversation.repository';
import { BalanceRepository } from './repositories/balance.repository';
import { BundlesRepository } from './repositories/bundles.repository';
import { UsageRepository } from './repositories/usage.repository';
import { SupportRepository } from './repositories/support.repository';

@Global()
@Module({
  providers: [
    SqliteConnectionService,
    ConversationRepository,
    BalanceRepository,
    BundlesRepository,
    UsageRepository,
    SupportRepository,
  ],
  exports: [
    SqliteConnectionService,
    BalanceRepository,
    BundlesRepository,
    UsageRepository,
    SupportRepository,
  ],
})
export class SqliteDataModule {}
```

**Acceptance Criteria:**
- [ ] Module marked as `@Global()` for single instance
- [ ] All repositories exported
- [ ] Proper dependency injection setup

---

#### Phase 1.2: Create Repositories (Days 2-3)

**Task 1.2.1: Conversation Repository**

**File:** `backend/src/infrastructure/data/repositories/conversation.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { SqliteConnectionService } from '../sqlite-connection.service';
import { randomUUID } from 'crypto';

export interface ConversationRow {
  id: string;
  session_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'agent';
  text: string;
  screen_type: string | null;
  timestamp: number;
  created_at: string;
}

@Injectable()
export class ConversationRepository {
  private readonly db: Database;
  private readonly statements: {
    createConversation: Database.Statement;
    getConversationBySession: Database.Statement;
    getConversationsByUser: Database.Statement;
    addMessage: Database.Statement;
    getMessagesByConversation: Database.Statement;
    deleteConversation: Database.Statement;
    updateConversationTimestamp: Database.Statement;
  };

  constructor(connection: SqliteConnectionService) {
    this.db = connection.getDatabase();
    this.statements = {
      createConversation: this.db.prepare(`
        INSERT INTO conversations (id, session_id, user_id, created_at, updated_at)
        VALUES (?, ?, ?, datetime('now'), datetime('now'))
      `),
      getConversationBySession: this.db.prepare('SELECT * FROM conversations WHERE session_id = ?'),
      getConversationsByUser: this.db.prepare(`
        SELECT c.*, COUNT(m.id) as message_count
        FROM conversations c
        LEFT JOIN messages m ON m.conversation_id = c.id
        WHERE c.user_id = ?
        GROUP BY c.id
        ORDER BY c.updated_at DESC
        LIMIT ?
      `),
      addMessage: this.db.prepare(`
        INSERT INTO messages (id, conversation_id, role, text, screen_type, timestamp, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `),
      getMessagesByConversation: this.db.prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC'
      ),
      deleteConversation: this.db.prepare('DELETE FROM conversations WHERE id = ?'),
      updateConversationTimestamp: this.db.prepare(
        "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
      ),
    };
  }

  createConversation(sessionId: string, userId: string): string {
    const id = randomUUID();
    this.statements.createConversation.run(id, sessionId, userId);
    return id;
  }

  getConversationBySession(sessionId: string): ConversationRow | null {
    return this.statements.getConversationBySession.get(sessionId) as ConversationRow | null;
  }

  getConversationsByUser(userId: string, limit: number = 10): Array<ConversationRow & { message_count: number }> {
    return this.statements.getConversationsByUser.all(userId, limit) as Array<ConversationRow & { message_count: number }>;
  }

  addMessage(
    conversationId: string,
    role: 'user' | 'agent',
    text: string,
    screenType: string | null,
    timestamp: number,
  ): void {
    this.statements.addMessage.run(randomUUID(), conversationId, role, text, screenType, timestamp);
  }

  getMessagesByConversation(conversationId: string): MessageRow[] {
    return this.statements.getMessagesByConversation.all(conversationId) as MessageRow[];
  }

  deleteConversation(conversationId: string): void {
    this.statements.deleteConversation.run(conversationId);
  }

  updateConversationTimestamp(conversationId: string): void {
    this.statements.updateConversationTimestamp.run(conversationId);
  }
}
```

**Acceptance Criteria:**
- [ ] CRUD operations for conversations
- [ ] Message persistence with conversation foreign key
- [ ] User-based conversation listing with pagination
- [ ] Cascade delete for messages
- [ ] Timestamp auto-updating

---

**Task 1.2.2: Balance Repository**

**File:** `backend/src/infrastructure/data/repositories/balance.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { SqliteConnectionService } from '../sqlite-connection.service';
import type { Balance } from '../../../domain/types/domain';

@Injectable()
export class BalanceRepository {
  private readonly db: Database;
  private readonly statements: {
    getById: Database.Statement;
    upsert: Database.Statement;
    seed: Database.Statement;
  };

  constructor(connection: SqliteConnectionService) {
    this.db = connection.getDatabase();
    this.statements = {
      getById: this.db.prepare('SELECT * FROM balances WHERE user_id = ?'),
      upsert: this.db.prepare(`
        INSERT INTO balances (user_id, current, currency, last_top_up, next_billing_date)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          current = excluded.current,
          currency = excluded.currency,
          last_top_up = excluded.last_top_up,
          next_billing_date = excluded.next_billing_date
      `),
      seed: this.db.prepare(`
        INSERT OR REPLACE INTO balances (user_id, current, currency, last_top_up, next_billing_date)
        VALUES (?, ?, ?, ?, ?)
      `),
    };
  }

  findById(userId: string): Balance | null {
    const row = this.statements.getById.get(userId) as 
      { current: number; currency: string; last_top_up: string; next_billing_date: string } | undefined;
    if (!row) return null;
    return {
      current: row.current,
      currency: row.currency,
      lastTopUp: row.last_top_up,
      nextBillingDate: row.next_billing_date,
    };
  }

  save(userId: string, balance: Balance): void {
    this.statements.upsert.run(userId, balance.current, balance.currency, balance.lastTopUp, balance.nextBillingDate);
  }

  seed(userId: string, balance: Balance): void {
    this.statements.seed.run(userId, balance.current, balance.currency, balance.lastTopUp, balance.nextBillingDate);
  }
}
```

**Acceptance Criteria:**
- [ ] Find balance by user ID
- [ ] Upsert (insert or update) balance
- [ ] Seed method for initial data

---

**Task 1.2.3: Bundles Repository**

**File:** `backend/src/infrastructure/data/repositories/bundles.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { SqliteConnectionService } from '../sqlite-connection.service';
import type { Bundle } from '../../../domain/types/domain';

@Injectable()
export class BundlesRepository {
  private readonly db: Database;
  private readonly statements: {
    getAll: Database.Statement;
    getById: Database.Statement;
    seed: Database.Statement;
  };

  constructor(connection: SqliteConnectionService) {
    this.db = connection.getDatabase();
    this.statements = {
      getAll: this.db.prepare('SELECT * FROM bundles ORDER BY price ASC'),
      getById: this.db.prepare('SELECT * FROM bundles WHERE id = ?'),
      seed: this.db.prepare(`
        INSERT OR REPLACE INTO bundles (id, name, description, price, currency, data_gb, minutes, sms, validity, popular)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
    };
  }

  findAll(): Bundle[] {
    const rows = this.statements.getAll.all() as Array<{
      id: string; name: string; description: string; price: number; currency: string;
      data_gb: number; minutes: number; sms: number; validity: string; popular: number;
    }>;
    return rows.map(row => ({
      id: row.id, name: row.name, description: row.description, price: row.price,
      currency: row.currency, dataGB: row.data_gb, minutes: row.minutes,
      sms: row.sms, validity: row.validity, popular: row.popular === 1,
    }));
  }

  findById(id: string): Bundle | null {
    const row = this.statements.getById.get(id) as any;
    if (!row) return null;
    return {
      id: row.id, name: row.name, description: row.description, price: row.price,
      currency: row.currency, dataGB: row.data_gb, minutes: row.minutes,
      sms: row.sms, validity: row.validity, popular: row.popular === 1,
    };
  }

  seed(bundle: Bundle): void {
    this.statements.seed.run(
      bundle.id, bundle.name, bundle.description, bundle.price, bundle.currency,
      bundle.dataGB, bundle.minutes, bundle.sms, bundle.validity, bundle.popular ? 1 : 0,
    );
  }
}
```

**Acceptance Criteria:**
- [ ] Find all bundles ordered by price
- [ ] Find bundle by ID
- [ ] Seed method with boolean-to-integer conversion

---

**Task 1.2.4: Usage Repository**

**File:** `backend/src/infrastructure/data/repositories/usage.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { SqliteConnectionService } from '../sqlite-connection.service';
import type { UsageEntry } from '../../../domain/types/domain';

@Injectable()
export class UsageRepository {
  private readonly db: Database;
  private readonly statements: {
    getByUser: Database.Statement;
    seed: Database.Statement;
  };

  constructor(connection: SqliteConnectionService) {
    this.db = connection.getDatabase();
    this.statements = {
      getByUser: this.db.prepare('SELECT * FROM usage_entries WHERE user_id = ?'),
      seed: this.db.prepare(`
        INSERT OR REPLACE INTO usage_entries (id, user_id, type, used, total, unit, period)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `),
    };
  }

  findByUserId(userId: string): UsageEntry[] {
    const rows = this.statements.getByUser.all(userId) as Array<{
      type: 'data' | 'voice' | 'sms'; used: number; total: number; unit: string; period: string;
    }>;
    return rows.map(row => ({
      type: row.type, used: row.used, total: row.total, unit: row.unit, period: row.period,
    }));
  }

  seed(userId: string, entry: UsageEntry): void {
    this.statements.seed.run(`${userId}-${entry.type}`, userId, entry.type, entry.used, entry.total, entry.unit, entry.period);
  }
}
```

**Acceptance Criteria:**
- [ ] Find all usage entries by user ID
- [ ] Seed method with composite ID generation

---

**Task 1.2.5: Support Repository**

**File:** `backend/src/infrastructure/data/repositories/support.repository.ts`

```typescript
import { Injectable } from '@nestjs/common';
import type { Database } from 'better-sqlite3';
import { SqliteConnectionService } from '../sqlite-connection.service';
import type { SupportTicket } from '../../../domain/types/domain';

@Injectable()
export class SupportRepository {
  private readonly db: Database;
  private readonly statements: {
    getTicketsByUser: Database.Statement;
    getFaq: Database.Statement;
    seedTicket: Database.Statement;
    seedFaq: Database.Statement;
  };

  constructor(connection: SqliteConnectionService) {
    this.db = connection.getDatabase();
    this.statements = {
      getTicketsByUser: this.db.prepare('SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC'),
      getFaq: this.db.prepare('SELECT * FROM faq ORDER BY id ASC'),
      seedTicket: this.db.prepare(`
        INSERT OR REPLACE INTO support_tickets (id, user_id, status, subject, created_at)
        VALUES (?, ?, ?, ?, ?)
      `),
      seedFaq: this.db.prepare(`
        INSERT OR REPLACE INTO faq (id, question, answer)
        VALUES (?, ?, ?)
      `),
    };
  }

  findTicketsByUserId(userId: string): SupportTicket[] {
    const rows = this.statements.getTicketsByUser.all(userId) as Array<{
      id: string; status: 'open' | 'in_progress' | 'resolved'; subject: string; created_at: string;
    }>;
    return rows.map(row => ({ id: row.id, status: row.status, subject: row.subject, createdAt: row.created_at }));
  }

  findAllFaq(): Array<{ question: string; answer: string }> {
    const rows = this.statements.getFaq.all() as Array<{ question: string; answer: string }>;
    return rows.map(row => ({ question: row.question, answer: row.answer }));
  }

  seedTicket(ticket: SupportTicket & { userId: string }): void {
    this.statements.seedTicket.run(ticket.id, ticket.userId, ticket.status, ticket.subject, ticket.createdAt);
  }

  seedFaq(id: number, question: string, answer: string): void {
    this.statements.seedFaq.run(id, question, answer);
  }
}
```

**Acceptance Criteria:**
- [ ] Find tickets by user ID ordered by date
- [ ] Find all FAQ items
- [ ] Seed methods for tickets and FAQ

---

#### Phase 1.3: Create Storage Port & Adapter (Day 4)

**Task 1.3.1: Create Conversation Storage Port**

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

export interface ConversationStoragePort {
  createConversation(sessionId: string, userId: string): Promise<ConversationDocument>;
  getConversation(sessionId: string): Promise<ConversationDocument | null>;
  getConversationsByUser(userId: string, limit?: number): Promise<ConversationDocument[]>;
  addMessage(
    conversationId: string,
    message: { role: 'user' | 'agent'; text: string; screenType?: ScreenType; timestamp: number },
  ): Promise<void>;
  deleteConversation(sessionId: string): Promise<void>;
}
```

**Acceptance Criteria:**
- [ ] Port interface defines all CRUD operations
- [ ] Uses ConversationDocument type consistently
- [ ] ScreenType properly typed from domain

---

**Task 1.3.2: Create SQLite Conversation Storage Adapter**

**File:** `backend/src/adapters/driven/storage/sqlite-conversation-storage.adapter.ts`

```typescript
import { Injectable } from '@nestjs/common';
import type { ConversationStoragePort } from '../../../../domain/ports/conversation-storage.port';
import { ConversationRepository, MessageRow } from '../../../../infrastructure/data/repositories/conversation.repository';
import type { ScreenType } from '../../../../domain/types/agent';

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
  metadata: { createdAt: Date; updatedAt: Date; totalMessages: number };
}

@Injectable()
export class SqliteConversationStorageAdapter implements ConversationStoragePort {
  constructor(private readonly repository: ConversationRepository) {}

  async createConversation(sessionId: string, userId: string): Promise<ConversationDocument> {
    const id = this.repository.createConversation(sessionId, userId);
    return { id, sessionId, userId, messages: [], metadata: { createdAt: new Date(), updatedAt: new Date(), totalMessages: 0 } };
  }

  async getConversation(sessionId: string): Promise<ConversationDocument | null> {
    const row = this.repository.getConversationBySession(sessionId);
    if (!row) return null;
    const messages = this.repository.getMessagesByConversation(row.id);
    return {
      id: row.id, sessionId: row.session_id, userId: row.user_id,
      messages: messages.map(this.mapMessageRow),
      metadata: { createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at), totalMessages: messages.length },
    };
  }

  async getConversationsByUser(userId: string, limit: number = 10): Promise<ConversationDocument[]> {
    const rows = this.repository.getConversationsByUser(userId, limit);
    const conversations: ConversationDocument[] = [];
    for (const row of rows) {
      const messages = this.repository.getMessagesByConversation(row.id);
      conversations.push({
        id: row.id, sessionId: row.session_id, userId: row.user_id,
        messages: messages.map(this.mapMessageRow),
        metadata: { createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at), totalMessages: row.message_count },
      });
    }
    return conversations;
  }

  async addMessage(conversationId: string, message: { role: 'user' | 'agent'; text: string; screenType?: ScreenType; timestamp: number }): Promise<void> {
    this.repository.addMessage(conversationId, message.role, message.text, message.screenType ?? null, message.timestamp);
    this.repository.updateConversationTimestamp(conversationId);
  }

  async deleteConversation(sessionId: string): Promise<void> {
    const conv = await this.getConversation(sessionId);
    if (conv) this.repository.deleteConversation(conv.id);
  }

  private mapMessageRow(row: MessageRow) {
    return { id: row.id, role: row.role, text: row.text, screenType: row.screen_type as ScreenType | undefined, timestamp: row.timestamp };
  }
}
```

**Acceptance Criteria:**
- [ ] Implements ConversationStoragePort
- [ ] Maps database rows to domain documents
- [ ] Handles null/undefined cases properly

---

**Task 1.3.3: Create SQLite Balance BFF Adapter**

**File:** `backend/src/adapters/driven/bff/balance/sqlite-balance-bff.adapter.ts`

```typescript
import { Injectable } from '@nestjs/common';
import type { BalanceBffPort } from '../../../../domain/ports/bff-ports';
import type { Balance } from '../../../../domain/types/domain';
import { BalanceRepository } from '../../../../infrastructure/data/repositories/balance.repository';

const DEFAULT_BALANCE: Balance = { current: 0, currency: 'USD', lastTopUp: 'N/A', nextBillingDate: 'N/A' };

@Injectable()
export class SqliteBalanceBffAdapter implements BalanceBffPort {
  constructor(private readonly repository: BalanceRepository) {}
  async getBalance(userId: string): Promise<Balance> {
    return this.repository.findById(userId) ?? DEFAULT_BALANCE;
  }
}
```

**Acceptance Criteria:**
- [ ] Implements BalanceBffPort
- [ ] Returns default balance if not found
- [ ] Delegates to repository

---

**Task 1.3.4: Update BFF Modules**

**File:** `backend/src/adapters/driven/bff/balance/balance-bff.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { BALANCE_BFF_PORT } from '../../../../domain/tokens';
import { SqliteBalanceBffAdapter } from './sqlite-balance-bff.adapter';

@Module({
  providers: [{ provide: BALANCE_BFF_PORT, useClass: SqliteBalanceBffAdapter }],
  exports: [BALANCE_BFF_PORT],
})
export class BalanceBffModule {}
```

**Acceptance Criteria:**
- [ ] Provider updated to use SQLite adapter
- [ ] Same pattern applied to Bundles, Usage, Support modules

---

#### Phase 1.4: Integrate with Supervisor (Day 4-5)

**Task 1.4.1: Modify SupervisorService for Persistence**

**File:** `backend/src/application/supervisor/supervisor.service.ts`

**Changes:**

```typescript
import type { ConversationStoragePort } from '../../domain/ports/conversation-storage.port';

export class SupervisorService {
  constructor(
    private readonly llm: LlmPort,
    private readonly modelName: string,
    private readonly temperature: number,
    private readonly maxTokens: number,
    private readonly storage: ConversationStoragePort,  // NEW
    logger?: PinoLogger,
  ) {
    this.toolResolver = new ToolResolver();
    this.logger = logger ?? null;
    this.logger?.setContext(SupervisorService.name);
  }

  async processRequest(request: AgentRequest): Promise<AgentResponse> {
    // ... existing setup

    try {
      // NEW: Get or create conversation
      let conversation = await this.storage.getConversation(request.sessionId);
      if (!conversation) {
        conversation = await this.storage.createConversation(request.sessionId, request.userId);
      }

      // NEW: Store user message
      await this.storage.addMessage(conversation.id, {
        role: 'user',
        text: request.prompt,
        timestamp: request.timestamp,
      });

      // ... existing ReAct loop ...
      const response = await this.processReActLoop(request, messages, collectedResults);

      // NEW: Store agent response
      await this.storage.addMessage(conversation.id, {
        role: 'agent',
        text: response.replyText,
        screenType: response.screenType,
        timestamp: Date.now(),
      });

      return response;
    } catch (error) {
      // ... existing error handling
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Conversation retrieved or created on each request
- [ ] User message persisted before processing
- [ ] Agent response persisted after processing
- [ ] Errors logged but don't break flow

---

**Task 1.4.2: Update Agent Module DI**

**File:** `backend/src/app.agent-module.ts`

**Changes:**

```typescript
import { CONVERSATION_STORAGE_PORT } from './domain/tokens';
import type { ConversationStoragePort } from './domain/ports/conversation-storage.port';

// In @Module providers array:
{
  provide: SupervisorService,
  useFactory: (
    llm: LlmPort,
    // ... existing deps
    storage: ConversationStoragePort,  // NEW
    config: ConfigService,
    logger: PinoLogger,
  ) => {
    const supervisor = new SupervisorService(
      llm,
      config.get<string>('LLM_MODEL_NAME')!,
      config.get<number>('LLM_TEMPERATURE')!,
      config.get<number>('LLM_MAX_TOKENS')!,
      storage,  // NEW
      logger,
    );
    // ... rest of setup
  },
  inject: [LLM_PORT, /* ... */, CONVERSATION_STORAGE_PORT, ConfigService, PinoLogger],
},
```

**Acceptance Criteria:**
- [ ] Storage port injected into SupervisorService factory
- [ ] Token properly imported and used

---

#### Phase 1.5: Add History API Endpoints (Day 5)

**Task 1.5.1: Create History Controller**

**File:** `backend/src/adapters/driving/rest/history.controller.ts`

```typescript
import { Controller, Get, Delete, Param, Query, NotFoundException, UseGuards } from '@nestjs/common';
import type { ConversationStoragePort } from '../../../domain/ports/conversation-storage.port';
import { RateLimitGuard } from './guards/rate-limit.guard';

@Controller('history')
@UseGuards(RateLimitGuard)
export class HistoryController {
  constructor(private readonly storage: ConversationStoragePort) {}

  @Get('sessions/:userId')
  async getSessions(@Param('userId') userId: string, @Query('limit') limit?: number) {
    return this.storage.getConversationsByUser(userId, limit ? parseInt(limit) : 10);
  }

  @Get('session/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const conv = await this.storage.getConversation(sessionId);
    if (!conv) throw new NotFoundException('Session not found');
    return conv;
  }

  @Delete('session/:sessionId')
  async deleteSession(@Param('sessionId') sessionId: string) {
    await this.storage.deleteConversation(sessionId);
    return { deleted: true };
  }
}
```

**Acceptance Criteria:**
- [ ] GET /api/history/sessions/:userId returns conversation list
- [ ] GET /api/history/session/:sessionId returns single conversation
- [ ] DELETE /api/history/session/:sessionId deletes conversation
- [ ] Rate limiting applied
- [ ] 404 on not found

---

**Task 1.5.2: Update Root Module**

**File:** `backend/src/app.module.ts`

```typescript
import { SqliteDataModule } from './infrastructure/data/sqlite-data.module';
import { HistoryController } from './adapters/driving/rest/history.controller';

@Module({
  imports: [ConfigModule, LoggerModule, SqliteDataModule, AgentModule],
  controllers: [AgentController, HealthController, HistoryController],
})
export class AppModule {}
```

**Acceptance Criteria:**
- [ ] SqliteDataModule imported
- [ ] HistoryController added to controllers array

---

#### Phase 1.6: Seed Initial Data (Day 5)

**Task 1.6.1: Create Seed Data Script**

**File:** `backend/src/infrastructure/data/seed-data.ts`

```typescript
import { BalanceRepository } from './repositories/balance.repository';
import { BundlesRepository } from './repositories/bundles.repository';
import { UsageRepository } from './repositories/usage.repository';
import { SupportRepository } from './repositories/support.repository';

export function seedData(
  balanceRepo: BalanceRepository,
  bundlesRepo: BundlesRepository,
  usageRepo: UsageRepository,
  supportRepo: SupportRepository,
): void {
  balanceRepo.seed('user-1', {
    current: 45.50, currency: 'USD', lastTopUp: '2024-01-15', nextBillingDate: '2024-02-01',
  });

  bundlesRepo.seed({
    id: 'bundle-1', name: 'Starter', description: 'Perfect for light users',
    price: 20, currency: 'USD', dataGB: 5, minutes: 100, sms: 50, validity: '30 days', popular: false,
  });
  bundlesRepo.seed({
    id: 'bundle-2', name: 'Standard', description: 'Most popular choice',
    price: 35, currency: 'USD', dataGB: 15, minutes: 300, sms: 200, validity: '30 days', popular: true,
  });
  bundlesRepo.seed({
    id: 'bundle-3', name: 'Premium', description: 'Unlimited everything',
    price: 50, currency: 'USD', dataGB: 50, minutes: 1000, sms: 500, validity: '30 days', popular: false,
  });

  usageRepo.seed('user-1', { type: 'data', used: 3.5, total: 10, unit: 'GB', period: 'Jan 1 - Jan 31' });
  usageRepo.seed('user-1', { type: 'voice', used: 120, total: 300, unit: 'min', period: 'Jan 1 - Jan 31' });
  usageRepo.seed('user-1', { type: 'sms', used: 25, total: 100, unit: 'msgs', period: 'Jan 1 - Jan 31' });

  supportRepo.seedTicket({ id: 'ticket-1', userId: 'user-1', status: 'resolved', subject: 'Billing question', createdAt: '2024-01-10T10:00:00Z' });
  supportRepo.seedTicket({ id: 'ticket-2', userId: 'user-1', status: 'open', subject: 'Connection issues', createdAt: '2024-01-12T14:30:00Z' });

  supportRepo.seedFaq(1, 'How do I top up?', 'Visit the top-up page or use the mobile app.');
  supportRepo.seedFaq(2, 'How do I change my bundle?', 'Contact support or use the bundles screen.');
  supportRepo.seedFaq(3, 'What happens if I exceed my data?', 'Additional charges may apply based on your plan.');
}
```

**Acceptance Criteria:**
- [ ] All domain data seeded
- [ ] Matches existing mock data structure
- [ ] Idempotent (safe to run multiple times)

---

**Task 1.6.2: Call Seed on Application Bootstrap**

**File:** `backend/src/main.ts`

```typescript
import { seedData } from './infrastructure/data/seed-data';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Seed data after app initialization
  const balanceRepo = app.get(BalanceRepository);
  const bundlesRepo = app.get(BundlesRepository);
  const usageRepo = app.get(UsageRepository);
  const supportRepo = app.get(SupportRepository);
  seedData(balanceRepo, bundlesRepo, usageRepo, supportRepo);
  
  await app.listen(3001);
}
```

**Acceptance Criteria:**
- [ ] Seed data loaded on startup
- [ ] No errors if data already exists

---

#### Phase 1.7: Frontend History Integration (Week 2)

**Task 1.7.1: Create Frontend History Service**

**File:** `src/services/historyService.ts`

```typescript
export interface SessionSummary {
  sessionId: string;
  messageCount: number;
  lastMessageAt: number;
  firstScreenType?: ScreenType;
}

export const historyService = {
  async getSavedSessions(): Promise<SessionSummary[]> {
    const userId = 'user-1'; // TODO: Get from auth context
    const res = await fetch(`/api/history/sessions/${userId}`);
    if (!res.ok) return [];
    const sessions = await res.json();
    return sessions.map((s: any) => ({
      sessionId: s.sessionId,
      messageCount: s.metadata.totalMessages,
      lastMessageAt: new Date(s.metadata.updatedAt).getTime(),
      firstScreenType: s.messages[0]?.screenType,
    }));
  },

  async loadSession(sessionId: string): Promise<ConversationMessage[]> {
    const res = await fetch(`/api/history/session/${sessionId}`);
    if (!res.ok) throw new Error('Session not found');
    const conv = await res.json();
    return conv.messages.map((m: any) => ({
      role: m.role as 'user' | 'agent',
      text: m.text,
      timestamp: m.timestamp,
    }));
  },

  async deleteSession(sessionId: string): Promise<void> {
    await fetch(`/api/history/session/${sessionId}`, { method: 'DELETE' });
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

**Acceptance Criteria:**
- [ ] Fetch sessions from backend
- [ ] Load single session with messages
- [ ] Delete session
- [ ] LocalStorage for current session tracking

---

**Task 1.7.2: Modify XState for Session Management**

**File:** `src/machines/orchestratorMachine.ts`

**Changes:**

```typescript
export interface OrchestratorContext {
  // ... existing fields
  sessionId: string;  // Remove hardcoded 'session-1'
  isSessionLoaded: boolean;
}

export type OrchestratorEvents =
  | { type: 'SUBMIT_PROMPT'; prompt: string }
  | { type: 'LOAD_SESSION'; sessionId: string }
  | { type: 'SESSION_LOADED'; messages: ConversationMessage[] }
  | { type: 'NEW_SESSION' }
  | { type: 'RESET' };

// In actor definition:
actors: {
  callAgent: fromPromise(async ({ input }) => {
    const request: AgentRequest = {
      prompt: input.prompt,
      sessionId: context.sessionId,  // Use dynamic session ID
      userId: 'user-1',
      conversationHistory: input.conversationHistory,
      timestamp: Date.now(),
    };
    return invokeAgentService(request);
  }),
},

// In actions:
actions: {
  initializeSession: assign({
    sessionId: () => {
      const existing = historyService.getCurrentSessionId();
      return existing ?? `session-${randomUUID()}`;
    },
    isSessionLoaded: true,
  }),
  loadSession: assign({
    conversationHistory: ({ event }) => event.messages,
    isSessionLoaded: true,
  }),
  saveSessionId: assign({
    sessionId: ({ event, context }) => {
      historyService.setCurrentSessionId(context.sessionId);
      return context.sessionId;
    },
  }),
},
```

**Acceptance Criteria:**
- [ ] Session ID generated dynamically
- [ ] Session ID persisted to localStorage
- [ ] LOAD_SESSION event loads history
- [ ] Hardcoded values removed

---

**Task 1.7.3: Create SessionList Component**

**File:** `src/components/SessionList/SessionList.tsx`

```typescript
import { styles } from './SessionList.module.css';

interface SessionSummary {
  sessionId: string;
  messageCount: number;
  lastMessageAt: number;
  firstScreenType?: ScreenType;
}

interface Props {
  sessions: SessionSummary[];
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
}

export function SessionList({ sessions, onSelectSession, onDeleteSession }: Props) {
  if (sessions.length === 0) {
    return <div className={styles.empty}>No previous sessions</div>;
  }

  return (
    <ul className={styles.list}>
      {sessions.map(session => (
        <li key={session.sessionId} className={styles.item}>
          <button onClick={() => onSelectSession(session.sessionId)} className={styles.selectBtn}>
            <span className={styles.screenType}>{session.firstScreenType ?? 'chat'}</span>
            <span className={styles.meta}>
              {session.messageCount} messages • {new Date(session.lastMessageAt).toLocaleDateString()}
            </span>
          </button>
          <button onClick={() => onDeleteSession(session.sessionId)} className={styles.deleteBtn}>
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}
```

**Acceptance Criteria:**
- [ ] Displays session list
- [ ] Select session button loads conversation
- [ ] Delete button removes session
- [ ] Empty state shown when no sessions

---

**Task 1.7.4: Add History Tab to AppShell**

**File:** `src/components/AppShell/AppShell.tsx`

**Changes:**

```typescript
const [activeTab, setActiveTab] = useState<'chat' | 'history'>('chat');
const [sessions, setSessions] = useState<SessionSummary[]>([]);

// Load sessions on mount
useEffect(() => {
  historyService.getSavedSessions().then(setSessions);
}, []);

const handleSelectSession = async (sessionId: string) => {
  const messages = await historyService.loadSession(sessionId);
  actor.send({ type: 'LOAD_SESSION', messages });
  historyService.setCurrentSessionId(sessionId);
  setActiveTab('chat');
};

const handleDeleteSession = async (sessionId: string) => {
  await historyService.deleteSession(sessionId);
  setSessions(sessions.filter(s => s.sessionId !== sessionId));
};

// In JSX:
<div className={styles.tabs}>
  <button className={activeTab === 'chat' ? styles.active : ''} onClick={() => setActiveTab('chat')}>Chat</button>
  <button className={activeTab === 'history' ? styles.active : ''} onClick={() => setActiveTab('history')}>History</button>
</div>

{activeTab === 'history' ? (
  <SessionList sessions={sessions} onSelectSession={handleSelectSession} onDeleteSession={handleDeleteSession} />
) : (
  // ... existing chat UI
)}
```

**Acceptance Criteria:**
- [ ] Tab toggle between Chat and History
- [ ] Sessions loaded on component mount
- [ ] Selecting session loads conversation
- [ ] Deleting session refreshes list

---

## Feature 2: SSE Streaming

### Overview

Implement Server-Sent Events (SSE) for real-time streaming of:
- Processing steps (pending → active → done)
- LLM reasoning tokens
- Tool call/result events
- Final screen data

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Transport** | SSE (Server-Sent Events) | Simpler than WebSocket, unidirectional fits use case |
| **Endpoint** | `POST /api/agent/chat/stream` | Separate from REST endpoint for clarity |
| **Frontend API** | `fetch` + `ReadableStream` | Native browser support, no library needed |
| **Fallback** | Polling (optional) | For older browsers without SSE |

### Implementation Tasks

#### Phase 2.1: Backend SSE Infrastructure (Week 3, Days 1-2)

**Task 2.1.1: Create Streaming Types**

**File:** `backend/src/domain/types/streaming.ts`

```typescript
import type { ProcessingStep, ScreenType, ScreenData } from './agent';

export type StreamEventType = 
  | 'step_start'
  | 'step_complete'
  | 'tool_call'
  | 'tool_result'
  | 'llm_content'
  | 'screen_ready'
  | 'complete'
  | 'error';

export interface StreamEvent {
  id: string;
  type: StreamEventType;
  timestamp: number;
  correlationId: string;
  data: StreamEventData;
}

export interface StreamEventData {
  step?: ProcessingStep;
  toolName?: string;
  screenType?: ScreenType;
  screenData?: ScreenData;
  content?: string;
  error?: string;
}
```

**Acceptance Criteria:**
- [ ] All event types defined
- [ ] StreamEventData flexible for different event payloads

---

**Task 2.1.2: Create Streaming Service**

**File:** `backend/src/application/supervisor/streaming-supervisor.service.ts`

```typescript
import { Observable } from 'rxjs';
import type { AgentRequest, AgentResponse, StreamEvent } from '../../domain/types/agent';
import { SupervisorService } from './supervisor.service';

export class StreamingSupervisorService {
  constructor(private readonly supervisor: SupervisorService) {}

  processRequestStream(request: AgentRequest): Observable<StreamEvent> {
    return new Observable(observer => {
      (async () => {
        try {
          // Emit step_start events
          observer.next({
            id: crypto.randomUUID(),
            type: 'step_start',
            timestamp: Date.now(),
            correlationId: request.sessionId,
            data: { step: { label: 'Understanding your request', status: 'active' } },
          });

          // Call existing supervisor logic
          const response = await this.supervisor.processRequest(request);

          // Emit screen_ready event
          observer.next({
            id: crypto.randomUUID(),
            type: 'screen_ready',
            timestamp: Date.now(),
            correlationId: request.sessionId,
            data: { screenType: response.screenType, screenData: response.screenData },
          });

          // Emit complete event
          observer.next({
            id: crypto.randomUUID(),
            type: 'complete',
            timestamp: Date.now(),
            correlationId: request.sessionId,
            data: {},
          });

          observer.complete();
        } catch (error) {
          observer.next({
            id: crypto.randomUUID(),
            type: 'error',
            timestamp: Date.now(),
            correlationId: request.sessionId,
            data: { error: error instanceof Error ? error.message : 'Unknown error' },
          });
          observer.error(error);
        }
      })();
    });
  }
}
```

**Acceptance Criteria:**
- [ ] Wraps existing SupervisorService
- [ ] Emits events at key milestones
- [ ] Handles errors gracefully
- [ ] Completes observable on success

---

**Task 2.1.3: Add SSE Endpoint**

**File:** `backend/src/adapters/driving/rest/agent.controller.ts`

```typescript
import { Controller, Post, Body, Get, UseGuards, Res, Sse } from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import type { StreamEvent } from '../../../domain/types/agent';

@Controller('agent')
@UseGuards(RateLimitGuard)
export class AgentController {
  constructor(private readonly supervisor: SupervisorService) {}

  @Post('chat')
  async chat(@Body(new PromptSanitizerPipe()) dto: AgentRequestDto): Promise<AgentResponse> {
    return this.supervisor.processRequest(dto);
  }

  @Post('chat/stream')
  @Sse()
  streamChat(@Body(new PromptSanitizerPipe()) dto: AgentRequestDto, @Res() res: Response): Observable<StreamEvent> {
    return this.supervisor.processRequestStream(dto);
  }
}
```

**Note:** May need `@nestjs/ssr` package or custom SSE implementation

**Acceptance Criteria:**
- [ ] SSE endpoint at POST /api/agent/chat/stream
- [ ] Returns Observable<StreamEvent>
- [ ] Same validation/pipes as REST endpoint
- [ ] Rate limiting applied

---

#### Phase 2.2: Frontend SSE Integration (Week 3, Days 3-4)

**Task 2.2.1: Create Streaming Agent Service**

**File:** `src/services/streamingAgentService.ts`

```typescript
import type { AgentRequest, AgentResponse, StreamEvent } from '../types/agent';

export async function* streamAgentResponse(request: AgentRequest): AsyncGenerator<StreamEvent, AgentResponse, unknown> {
  const response = await fetch('/api/agent/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Stream error: ${response.status}`);
  }

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const event = JSON.parse(line.slice(6));
        yield event;
      }
    }
  }

  // Return final response (for AsyncGenerator return value)
  throw new Error('Stream ended without complete event');
}
```

**Acceptance Criteria:**
- [ ] AsyncGenerator for streaming events
- [ ] SSE format parsing (data: {...})
- [ ] Error handling for non-OK responses
- [ ] Buffer management for partial chunks

---

**Task 2.2.2: Modify XState for Streaming**

**File:** `src/machines/orchestratorMachine.ts`

**Changes:**

```typescript
export type OrchestratorEvents =
  | { type: 'SUBMIT_PROMPT'; prompt: string }
  | { type: 'STREAM_EVENT'; event: StreamEvent }
  | { type: 'STREAM_COMPLETE'; response: AgentResponse }
  | { type: 'STREAM_ERROR'; error: string }
  | { type: 'RESET' };

export interface OrchestratorContext {
  // ... existing fields
  isStreaming: boolean;
  streamingReply: string;
  currentStepIndex: number;
}

states: {
  idle: { ... },
  processing: {
    entry: ['setIsStreaming'],
    on: {
      STREAM_EVENT: {
        actions: ['processStreamEvent', 'updateProcessingSteps'],
      },
      STREAM_COMPLETE: {
        target: 'rendering',
        actions: ['finalizeResponse', 'setIsStreamingFalse'],
      },
      STREAM_ERROR: {
        target: 'error',
        actions: ['setIsStreamingFalse'],
      },
    },
  },
  streaming: { ... },
  rendering: { ... },
  error: { ... },
}
```

**Acceptance Criteria:**
- [ ] New events for stream lifecycle
- [ ] New context fields for streaming state
- [ ] Streaming state handles events
- [ ] Transitions to rendering on complete

---

**Task 2.2.3: Update UI Components**

**File:** `src/components/ProcessingIndicator/ProcessingIndicator.tsx`

**Changes:**

```typescript
interface Props {
  steps: ProcessingStep[];
  isStreaming?: boolean;
}

export function ProcessingIndicator({ steps, isStreaming }: Props) {
  return (
    <div className={styles.container}>
      {steps.map((step, index) => (
        <div key={index} className={`${styles.step} ${styles[step.status]}`}>
          {step.status === 'active' && isStreaming && (
            <span className={styles.typing}>...</span>
          )}
          {step.label}
        </div>
      ))}
    </div>
  );
}
```

**Acceptance Criteria:**
- [ ] Shows active step highlighting
- [ ] Typing indicator during streaming
- [ ] Smooth transitions between states

---

## Implementation Timeline

### Week 1: SQLite Foundation

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1 | Install better-sqlite3, create connection service | Working SQLite database |
| 2 | Create migration runner, all repositories | All CRUD operations |
| 3 | Create adapters, update modules | SQLite adapters wired |
| 4 | Modify Supervisor for persistence | Conversations saved |
| 5 | Add history endpoints, seed data | API endpoints working |

### Week 2: Frontend History

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1 | Create history service | Service layer complete |
| 2 | Modify XState for sessions | Dynamic session management |
| 3 | Create SessionList component | UI component |
| 4 | Add history tab to AppShell | Full history UI |
| 5 | Testing, bug fixes | Stable release |

### Week 3: SSE Streaming

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1 | Create streaming types, service | Backend streaming foundation |
| 2 | Add SSE endpoint | /api/agent/chat/stream |
| 3 | Create frontend streaming service | AsyncGenerator |
| 4 | Modify XState for streaming | Streaming state machine |
| 5 | Update UI components, testing | Streaming UI |

### Week 4: Polish & Testing

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| 1-2 | Unit tests for SQLite | Test coverage |
| 3 | E2E tests for history | Playwright tests |
| 4 | E2E tests for streaming | Streaming tests |
| 5 | Documentation, bug fixes | Production-ready |

---

## Testing Strategy

### SQLite Tests

```typescript
// backend/test/conversation.repository.sqlite.spec.ts
describe('ConversationRepository (SQLite)', () => {
  let db: Database;
  let repo: ConversationRepository;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE conversations (...); CREATE TABLE messages (...);');
    repo = new ConversationRepository({ getDatabase: () => db } as any);
  });

  afterAll(() => db.close());

  it('should create conversation', () => {
    const id = repo.createConversation('session-1', 'user-1');
    expect(id).toBeDefined();
  });

  it('should retrieve conversation by session ID', () => {
    repo.createConversation('session-1', 'user-1');
    const conv = repo.getConversationBySession('session-1');
    expect(conv).not.toBeNull();
  });

  it('should add message to conversation', () => {
    const convId = repo.createConversation('session-1', 'user-1');
    repo.addMessage(convId, 'user', 'Hello', 123456);
    const messages = repo.getMessagesByConversation(convId);
    expect(messages.length).toBe(1);
  });
});
```

### History E2E Tests

```typescript
// e2e/history.spec.ts
test('should save and load conversation history', async ({ page }) => {
  await page.goto('/');
  
  // Send a message
  await page.fill('[data-testid="prompt-input"]', 'Check my balance');
  await page.click('[data-testid="send-button"]');
  
  // Wait for response
  await page.waitForSelector('[data-testid="balance-screen"]');
  
  // Refresh page
  await page.reload();
  
  // Verify conversation restored
  await page.waitForSelector('[data-testid="chat-bubble"]:has-text("Check my balance")');
});

test('should list previous sessions in history tab', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="history-tab"]');
  await page.waitForSelector('[data-testid="session-list"]');
  expect(await page.locator('[data-testid="session-item"]').count()).toBeGreaterThan(0);
});
```

### Streaming Tests

```typescript
// backend/test/streaming-supervisor.service.spec.ts
describe('StreamingSupervisorService', () => {
  it('should emit step_start event', (done) => {
    const stream = service.processRequestStream(mockRequest);
    stream.subscribe({
      next: (event) => {
        expect(event.type).toBe('step_start');
        done();
      },
    });
  });

  it('should emit screen_ready event', (done) => {
    const stream = service.processRequestStream(mockRequest);
    stream.subscribe({
      next: (event) => {
        if (event.type === 'screen_ready') {
          expect(event.data.screenType).toBeDefined();
          done();
        }
      },
    });
  });
});
```

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **better-sqlite3 native compilation fails** | Low | High | Provide pre-built binaries, fallback to sql.js |
| **Database corruption** | Low | High | WAL mode, regular backups, transaction safety |
| **SSE browser incompatibility** | Low | Medium | Feature detection, fallback to polling |
| **XState complexity causes bugs** | Medium | Medium | Comprehensive type tests, state visualization |
| **Performance degradation with large history** | Medium | Low | Pagination, lazy loading, indexes |
| **Migration failures** | Low | High | Idempotent migrations, rollback scripts |

---

## Success Criteria

### SQLite Persistence

- [ ] Conversations persist across page refresh
- [ ] Users can view previous sessions
- [ ] Users can delete sessions
- [ ] No data loss on application restart
- [ ] Database file < 10MB after 100 conversations
- [ ] Query response time < 100ms for session list

### SSE Streaming

- [ ] First processing step visible within 200ms
- [ ] Steps animate sequentially (not all at once)
- [ ] No console errors during streaming
- [ ] Graceful fallback if streaming fails
- [ ] Streaming works in Chrome, Firefox, Safari, Edge

### Code Quality

- [ ] Unit test coverage > 80% for new code
- [ ] E2E tests for all new features
- [ ] No TypeScript errors or warnings
- [ ] ESLint passes
- [ ] Documentation updated

---

## Appendix A: File Creation Checklist

### Backend Files (New)

- [ ] `backend/src/infrastructure/data/sqlite-connection.service.ts`
- [ ] `backend/src/infrastructure/data/migrations/run-migrations.ts`
- [ ] `backend/src/infrastructure/data/sqlite-data.module.ts`
- [ ] `backend/src/infrastructure/data/repositories/conversation.repository.ts`
- [ ] `backend/src/infrastructure/data/repositories/balance.repository.ts`
- [ ] `backend/src/infrastructure/data/repositories/bundles.repository.ts`
- [ ] `backend/src/infrastructure/data/repositories/usage.repository.ts`
- [ ] `backend/src/infrastructure/data/repositories/support.repository.ts`
- [ ] `backend/src/infrastructure/data/seed-data.ts`
- [ ] `backend/src/domain/ports/conversation-storage.port.ts`
- [ ] `backend/src/domain/types/streaming.ts`
- [ ] `backend/src/adapters/driven/storage/sqlite-conversation-storage.adapter.ts`
- [ ] `backend/src/adapters/driven/bff/balance/sqlite-balance-bff.adapter.ts`
- [ ] `backend/src/adapters/driving/rest/history.controller.ts`
- [ ] `backend/src/application/supervisor/streaming-supervisor.service.ts`

### Frontend Files (New)

- [ ] `src/services/historyService.ts`
- [ ] `src/services/streamingAgentService.ts`
- [ ] `src/components/SessionList/SessionList.tsx`
- [ ] `src/components/SessionList/SessionList.module.css`

### Backend Files (Modified)

- [ ] `backend/src/application/supervisor/supervisor.service.ts`
- [ ] `backend/src/app.agent-module.ts`
- [ ] `backend/src/app.module.ts`
- [ ] `backend/src/adapters/driving/rest/agent.controller.ts`
- [ ] `backend/src/main.ts`
- [ ] `backend/package.json`

### Frontend Files (Modified)

- [ ] `src/machines/orchestratorMachine.ts`
- [ ] `src/components/AppShell/AppShell.tsx`
- [ ] `src/components/ProcessingIndicator/ProcessingIndicator.tsx`

---

## Appendix B: Environment Variables

```bash
# SQLite Configuration
DATABASE_PATH=./data/telecom.db
STORAGE_TYPE=sqlite  # | memory (for tests)

# Feature Flags
HISTORY_ENABLED=true
STREAMING_ENABLED=true

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

## Appendix C: Database Schema Diagram

```
┌─────────────────────┐       ┌─────────────────────┐
│   conversations     │       │      messages       │
├─────────────────────┤       ├─────────────────────┤
│ id (PK)             │◄──────│ conversation_id (FK)│
│ session_id          │       │ id (PK)             │
│ user_id             │       │ role                │
│ created_at          │       │ text                │
│ updated_at          │       │ screen_type         │
└─────────────────────┘       │ timestamp           │
                              │ created_at          │
                              └─────────────────────┘

┌─────────────────────┐
│     balances        │
├─────────────────────┤
│ user_id (PK)        │
│ current             │
│ currency            │
│ last_top_up         │
│ next_billing_date   │
└─────────────────────┘

┌─────────────────────┐
│      bundles        │
├─────────────────────┤
│ id (PK)             │
│ name                │
│ description         │
│ price               │
│ data_gb             │
│ minutes             │
│ sms                 │
│ validity            │
│ popular             │
└─────────────────────┘

┌─────────────────────┐
│   usage_entries     │
├─────────────────────┤
│ id (PK, AUTO)       │
│ user_id             │
│ type                │
│ used                │
│ total               │
│ unit                │
│ period              │
└─────────────────────┘

┌─────────────────────┐
│  support_tickets    │
├─────────────────────┤
│ id (PK)             │
│ user_id             │
│ status              │
│ subject             │
│ created_at          │
└─────────────────────┘

┌─────────────────────┐
│        faq          │
├─────────────────────┤
│ id (PK, AUTO)       │
│ question            │
│ answer              │
└─────────────────────┘
```

---

**Document End**
