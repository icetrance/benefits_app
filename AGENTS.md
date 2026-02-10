# AGENTS.md

## Project Overview
ExpenseFlow is a single-tenant expense reimbursement platform with:
- Mandatory approval workflow with manager hierarchy
- Three expense types: Benefits, Travel, Protocol
- Annual budget tracking per employee per benefit category
- Tamper-evident audit trail
- Role-based access (EMPLOYEE, APPROVER, FINANCE_ADMIN, SYSTEM_ADMIN)
- Admin interface for user management

Tech stack:
- Backend: NestJS + TypeScript + Prisma + PostgreSQL
- Frontend: React + TypeScript + Vite
- Infra: Docker + Docker Compose

## Repo Layout
- `backend/` NestJS API
  - `src/auth/` login + JWT
  - `src/requests/` request lifecycle + manager-scoped approvals
  - `src/categories/` expense categories (filterable by expense type)
  - `src/admin/` user CRUD (SYSTEM_ADMIN only)
  - `src/budget/` budget allocation endpoints
  - `src/audit/` tamper-evident audit trail
  - `src/common/` guards, decorators (JWT, Roles, CurrentUser)
  - `prisma/` schema, migrations, seed
- `frontend/` React SPA
  - `src/App.tsx` all components (auth, dashboard, requests, approval, finance, admin)
  - `src/styles.css` e-Ink minimalist design system
- `docker-compose.yml` local/prod containers
- `CHANGELOG.md` deployment history and feature log
- `QUALITY_IMPROVEMENTS.md` planned, in-progress, and completed improvements

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
- **EMPLOYEE**: create/submit/withdraw requests; view own requests and budget allocations
- **APPROVER**: approve/reject/return requests from direct reports; view team decisions
- **FINANCE_ADMIN**: mark reimbursed (PAID); see all requests with "Approved By" column
- **SYSTEM_ADMIN**: full access to all views + admin user management panel

## Manager Hierarchy
- Each employee has a `managerId` pointing to their approver
- Approvers only see requests from their direct reports
- SYSTEM_ADMIN bypasses all hierarchy checks
- Finance sees all requests globally

## Expense Types
- **BENEFIT** — Training (€1000), Eyeglass (€200), Fitness (€500) per employee/year
- **TRAVEL** — Business travel expenses
- **PROTOCOL** — Client entertainment (dinners, events)

## Budget System
- `BudgetAllocation` records track `allocated` and `spent` per user/category/year
- Budget deduction occurs when a BENEFIT request reaches PAID status
- Dashboard shows budget progress bars (remaining vs. spent)
- Default allocations auto-created when admin creates new employees

## Important Endpoints

### Auth
- `POST /auth/login`

### Requests
- `POST /requests` (create draft)
- `POST /requests/:id/submit`
- `POST /requests/:id/withdraw`
- `POST /requests/:id/approve` (comment required)
- `POST /requests/:id/reject` (comment required)
- `POST /requests/:id/return` (comment required)
- `POST /requests/:id/finance/paid`
- `GET /requests` (filtered by role: own for employees, team for approvers, all for finance)

### Categories
- `GET /categories?type=BENEFIT|TRAVEL|PROTOCOL`

### Budget
- `GET /budget` (current user's allocations)
- `GET /budget/:userId` (specific user)

### Admin (SYSTEM_ADMIN only)
- `GET /admin/users`
- `GET /admin/users/:id`
- `POST /admin/users` (create user)
- `PATCH /admin/users/:id` (update user)
- `DELETE /admin/users/:id` (deactivate)
- `POST /admin/users/:id/reset-password`

### Audit
- `GET /audit/verify`

## Seeded Users
| Email | Role | Manager |
|-------|------|---------|
| approver1@expenseflow.local | APPROVER | — |
| approver2@expenseflow.local | APPROVER | — |
| employee1@expenseflow.local | EMPLOYEE | approver1 |
| employee2@expenseflow.local | EMPLOYEE | approver1 |
| employee3@expenseflow.local | EMPLOYEE | approver2 |
| employee4@expenseflow.local | EMPLOYEE | approver2 |
| finance@expenseflow.local | FINANCE_ADMIN | — |
| admin@expenseflow.local | SYSTEM_ADMIN | — |

Passwords are printed once at seed time.

## UI Pages
- **Login** — e-Ink centered card with OEDIV branding
- **Dashboard** — stats cards + budget allocation progress bars
- **My Requests** — expense type tabs (Benefit/Travel/Protocol), create form, open + history
- **Approval Queue** — team requests with Approve/Reject/Return actions, decision history
- **Finance Queue** — approved requests with "Approved By" column, reimbursement history
- **Request Detail** — amount, reason, invoice info, approval timeline with actor names
- **Audit Trail** — chain integrity verification
- **User Management** (admin) — table with role badges, manager, status, create/edit/password modals

## Known Considerations
- Line items and receipts are not exposed in the UI yet.
- Submit validation is relaxed to allow current UI flow.
- SPA routing uses Nginx `try_files` fallback.

## Quick Troubleshooting
- 404 on deep links: ensure `frontend/nginx.conf` is used in image.
- API calls hitting `localhost`: check `frontend/.env` and rebuild.
- Prisma/OpenSSL errors: backend image uses Debian slim + openssl.
- Backend crash on startup: ensure JwtModule is imported in all modules using JwtAuthGuard.
