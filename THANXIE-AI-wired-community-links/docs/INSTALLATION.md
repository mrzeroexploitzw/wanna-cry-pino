# Installation

## Requirements

- Node.js 22+
- npm 10+
- A Meta WhatsApp Business Platform application

## Local setup

```bash
cp .env.example .env
npm install
npm run check
npm test
npm start
```

Health endpoint:

`GET /health`

## Database

SQLite is created automatically at `DATABASE_PATH`.

Never commit `.env` or production database files.

## Simplified structure

The application entry point is `src/app.js`. There is no `config/src/` application tree in this release.
