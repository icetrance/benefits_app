# AGENTS.md

## Project Overview
ExpenseFlow is a single-tenant expense reimbursement platform with:
- Mandatory approval workflow
- Audit trail
- Role-based access (EMPLOYEE, APPROVER, FINANCE_ADMIN, SYSTEM_ADMIN)

Tech stack:
- Backend: NestJS + TypeScript + Prisma + PostgreSQL
- Frontend: React + TypeScript + Vite
- Infra: Docker + Docker Compose

## Repo Layout
- `backend/` NestJS API
- `frontend/` React SPA
- `docker-compose.yml` local/prod containers

## Local/Server Run (Docker)
From repo root (`/opt/benefits_app`):

```bash
docker compose up -d --build
```

Migrations/seed:
```bash
docker compose exec backend npm run migrate:deploy
docker compose exec backend npm run seed
```

## Environments
Backend (`backend/.env` or compose env):
- `DATABASE_URL`
- `JWT_SECRET`
- `UPLOAD_DIR`
- `SMTP_*` (optional)

Frontend (`frontend/.env`):
- `VITE_API_BASE` (API URL)

## Roles & Workflow
- EMPLOYEE: create/submit/withdraw requests; view own history
- APPROVER: approve/disapprove (approval requires reason); view decisions
- FINANCE_ADMIN: mark reimbursed (PAID); view reimbursement history
- SYSTEM_ADMIN: full access

## Important Endpoints
- `POST /auth/login`
- `POST /requests` (create)
- `POST /requests/:id/submit`
- `POST /requests/:id/withdraw`
- `POST /requests/:id/approve` (comment required)
- `POST /requests/:id/reject`
- `POST /requests/:id/finance/paid`
- `GET /requests` (includes `employee` and `actions`)

## UI Notes
- `My Requests`: open + history (monthly by `submittedAt`)
- `Approval Queue`: open + history; includes submitted-by/at columns
- `Finance Queue`: open + history; includes submitted-by/at columns

## Known Considerations
- Line items and receipts are not exposed in the UI yet.
- Submit validation is relaxed to allow current UI flow.
- SPA routing uses Nginx `try_files` fallback.

## Quick Troubleshooting
- 404 on deep links: ensure `frontend/nginx.conf` is used in image.
- API calls hitting `localhost`: check `frontend/.env` and rebuild.
- Prisma/OpenSSL errors: backend image uses Debian slim + openssl.

