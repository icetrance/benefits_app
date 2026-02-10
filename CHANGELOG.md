# Changelog

All notable deployments, fixes, and feature additions to ExpenseFlow.

---

## 2026-02-10 — Major Overhaul

### Backend — Schema & Authorization
- Added `managerId` self-referential relation on `User` for manager hierarchy
- Added `ExpenseType` enum (`BENEFIT`, `TRAVEL`, `PROTOCOL`) to `ExpenseRequest` and `ExpenseCategory`
- Added `BudgetAllocation` model tracking `allocated`/`spent` per user/category/year
- Added `defaultBudget` field on `ExpenseCategory` for automatic allocation setup
- Extended JWT payload with `fullName` and `managerId`
- Manager-scoped approvals: approvers only see direct reports' requests
- `SYSTEM_ADMIN` role bypasses all hierarchy checks
- Budget deduction implemented on PAID status for BENEFIT expense type

### Backend — New Modules
- **Admin module** (`/admin/users`): CRUD for users, password reset, role/manager assignment, auto budget allocation on employee creation (SYSTEM_ADMIN only)
- **Budget module** (`/budget`): endpoints for retrieving user budget allocations by year
- **Category filtering**: `GET /categories?type=BENEFIT` filters categories by expense type

### Frontend — Complete Rewrite
- **e-Ink minimalist design system**: Inter font, monochrome palette, premium cards/pills/badges, subtle transitions
- **Role-based sidebar**: employees see Dashboard + My Requests; admins see all including User Management
- **Dashboard**: stats cards (total/pending/approved/paid) + budget progress bars
- **Expense type tabs**: Benefit/Travel/Protocol with dynamic category filtering in request form
- **Approval Queue**: Approve/Reject/Return buttons, team-scoped view, decision history
- **Finance Queue**: "Approved By" column showing who approved each request
- **Admin User Management**: table with role badges, create/edit/password reset modals, deactivation
- **Request Detail**: timeline with actor names, expense type badge, invoice details

### Seed Data
- 8 users: 2 approvers, 4 employees (2 per approver), 1 finance admin, 1 system admin
- 5 categories: Training, Eyeglass, Fitness (BENEFIT), Travel Expenses (TRAVEL), Client Entertainment (PROTOCOL)
- 12 budget allocations: 4 employees × 3 benefit categories

### Fixes
- Added `JwtModule.register({})` to AdminModule and BudgetModule (resolved JwtAuthGuard dependency)
- Changed `Roles` decorator to accept `string[]` for compatibility with `SYSTEM_ADMIN` constant

---

## 2026-02-09 — Initial Deployment

### Infrastructure
- Deployed to VPS via Docker Compose (Postgres 15, NestJS backend, React/Vite frontend behind Nginx)
- Backend image: `node:18-bullseye-slim` with OpenSSL for Prisma engine compatibility
- Frontend SPA routing: Nginx `try_files $uri /index.html` fallback
- API base configured via `frontend/.env` → `VITE_API_BASE`

### Build Fixes Applied
- Frontend: added `vite-env.d.ts` for `import.meta.env` typing
- Backend: definite assignment (`!`) on DTO fields for strict mode
- Backend: added `pdfkit.d.ts` type declaration
- Backend: fixed `nodemailer` import (`createTransport` undefined)
- Backend: Prisma client copied into runtime image correctly
- Backend: resolved duplicate providers/controllers in `app.module.ts`

### Features Shipped
- **Request lifecycle**: create draft → submit → approve/reject → finance reimburse (PAID)
- **Withdraw**: employees can withdraw SUBMITTED or UNDER_REVIEW requests back to DRAFT
- **Approval comments**: approvers must provide a reason when approving or rejecting
- **History views**: monthly filtering by `submittedAt` for employee, approver, and finance roles
- **Invoice fields**: `invoiceNumber`, `invoiceDate`, `supplier` added to schema, DTOs, forms, and tables
- **Role-based navigation**: sidebar tabs restricted by user role
- **Status badges**: color-coded pills (red/yellow/green)

### Seeded Data
- 4 users: employee, approver, finance, admin (passwords printed at seed time)
- 4 categories: Travel, Fitness, Screen Glasses, Other

### Known Limitations (at time of deploy)
- No UI for line items or receipts (backend supports them)
- Submit validation relaxed (no line items/receipts required)
- No per-user session isolation (all approvers see all requests)

### Commands
```bash
docker compose up -d --build
docker compose exec backend npm run migrate:deploy
docker compose exec backend npm run seed
```
