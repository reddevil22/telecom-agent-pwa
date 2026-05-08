# Contributing to Telecom Agent PWA

Thank you for your interest in contributing!

## Getting Started

### Prerequisites
- Node.js 18+
- An OpenAI-compatible LLM server (e.g., llama-server) running on port 8080

### Setup

```bash
# Frontend
npm install
cp .env.example .env

# Backend
cd backend
npm install
cp .env.example .env
```

### Development

```bash
# Frontend (root)
npm run dev

# Backend (separate terminal)
cd backend && npm run start:dev
```

### Testing

```bash
# Frontend E2E
npx playwright test

# Backend unit tests
cd backend && npm test
```

## Code Style

- TypeScript strict mode in both frontend and backend
- Run `npm run lint` before committing
- Use Conventional Commits format for commit messages

## Pull Requests

1. Fork the repository
2. Create a feature branch (`feat/your-feature`)
3. Make your changes with passing tests
4. Run lint and tests locally
5. Open a PR with a clear description

## Reporting Bugs

Use the bug report template and include:
- Node.js version
- Steps to reproduce
- Expected vs actual behavior