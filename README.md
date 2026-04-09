# TMAC CRM

TMAC CRM is a branded, browser-based CRM foundation for secure multi-user client handling across multiple offices.

## Included in this package
- React + TypeScript frontend
- Express + TypeScript backend
- Prisma PostgreSQL schema
- Secure login structure
- TMAC logo and purple/green theme
- Client dashboard, list view, search, and create flow
- Docker deployment starter files
- Step-by-step deployment notes

## What this build is
This is a **deployment-ready MVP foundation**.

It is designed to let you:
- log in securely
- have multiple staff use the same system
- store data centrally
- access it from different locations and IP addresses
- deploy it to a live domain

## What still needs doing before a public production launch
This is enough to test live, but before full business rollout you should still add:
- password reset
- stronger role controls
- document uploads
- full task workflows
- full API partner ingestion
- backups/monitoring
- HTTPS + reverse proxy hardening
- 2FA if desired

## Local development
### Backend
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run seed
npm run dev
```

### Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

## Docker deployment
From the project root:
```bash
docker compose up -d --build
```

Frontend opens on port `8080`.
Backend opens on port `4000`.

## First login
Use the admin credentials configured in your environment values.
Default seed credentials are:
- email: `admin@tmaccrm.local`
- password: `ChangeMe123!`

Change them immediately before live testing.

## Hosting guidance
Your 123 Reg account is very useful for the **domain name and DNS**.
For the actual app, you will usually want either:
- a VPS/server, or
- app hosting plus a PostgreSQL database

See `deploy/DEPLOY-STEP-BY-STEP.md` for the simplest path.
