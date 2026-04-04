# Telecom Agent PWA

An AI-powered telecom customer service Progressive Web App (PWA) built with React 19, TypeScript, and NestJS.

## Overview

This application provides a conversational interface for telecom customers to:
- Check account balance and top-up
- Browse and purchase data/voice bundles
- View usage statistics
- Create support tickets

## Architecture

### Frontend (React + Vite)
- **Framework**: React 19 with TypeScript (strict mode)
- **Build Tool**: Vite 8 with PWA support
- **State Management**: XState v5 for conversation orchestration
- **Styling**: CSS Modules with design tokens
- **Testing**: Playwright for E2E tests

### Backend (NestJS)
- **Framework**: NestJS with TypeScript
- **Architecture**: Hexagonal (Ports & Adapters)
- **LLM Integration**: OpenAI-compatible API (llama-server)
- **Persistence**: SQLite with migrations
- **Security**: Multi-layer defense (prompt sanitization, rate limiting, tool validation)

## Quick Start

### Prerequisites
- Node.js 20+
- LLM server running (e.g., llama-server on port 8080)

### Frontend Setup
```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start dev server
npm run dev        # http://localhost:5173

# Build for production
npm run build
npm run preview
```

### Backend Setup
```bash
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start dev server
npm run start:dev  # http://localhost:3001

# Build for production
npm run build
npm run start:prod
```

## Environment Variables

### Frontend (.env)
```
VITE_API_BASE_URL=http://localhost:3001
NODE_ENV=development
```

### Backend (backend/.env)
```
LLM_BASE_URL=http://localhost:8080/v1
LLM_API_KEY=
LLM_MODEL_NAME=meta-llama/Llama-3-70b
LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=1024
PORT=3001
NODE_ENV=development
LOG_LEVEL=info
```

## Running Tests

### Frontend E2E Tests
```bash
# Run Playwright tests
npx playwright test

# Run with UI
npx playwright test --ui
```

### Backend Tests
```bash
cd backend

# Unit tests
npm run test

# E2E tests
npm run test:e2e
```

## Project Structure

```
telecom-agent-pwa/
├── src/                      # Frontend source
│   ├── components/           # React components
│   ├── screens/              # Screen components (Balance, Bundles, etc.)
│   ├── machines/             # XState machines
│   ├── services/             # API services
│   └── theme/                # CSS design tokens
├── backend/                  # NestJS backend
│   ├── src/
│   │   ├── domain/           # Core business logic
│   │   ├── application/      # Use cases & sub-agents
│   │   ├── adapters/         # HTTP controllers & external APIs
│   │   └── infrastructure/   # Database & LLM clients
│   └── data/                 # SQLite database
├── e2e/                      # Playwright E2E tests
└── AGENT.md                  # Detailed architecture docs
```

## Key Features

- **AI-Powered Conversations**: Natural language interface powered by LLM
- **Two-Phase Bundle Purchase**: Review details before confirming purchase
- **Real-time Processing**: Visual feedback during agent processing
- **PWA Support**: Installable on mobile/desktop with offline capabilities
- **Conversation History**: Persistent chat history with SQLite
- **Security**: Defense-in-depth with prompt sanitization and rate limiting

## Documentation

- [Frontend Architecture](AGENT.md) - Detailed frontend documentation
- [Backend Architecture](backend/AGENT.md) - Backend architecture & API docs

## License

MIT
