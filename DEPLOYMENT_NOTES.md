# Deployment Notes (ExpenseFlow)

Date: 2026-02-09

## Summary
Deployed ExpenseFlow to VPS with Docker Compose. Applied multiple fixes to make the app build/run and added workflow features (submit/withdraw, approvals with reasons, finance reimbursement) plus history views and role-based navigation.

## Access
- Frontend: http://<VPS_IP>:8080
- Backend: http://<VPS_IP>:3000

Seeded users (from `backend/prisma/seed.js`):
- employee@expenseflow.local (EMPLOYEE)
- approver@expenseflow.local (APPROVER)
- finance@expenseflow.local (FINANCE_ADMIN)
- admin@expenseflow.local (SYSTEM_ADMIN)

Passwords are generated at seed time and printed in the seed output.

## Infrastructure / Runtime Fixes
- Docker access required escalation; uses Docker Compose.
- Backend image switched to Debian slim to resolve Prisma/OpenSSL runtime errors.
- Added OpenSSL in backend runtime image.
- Backend container start path fixed to `dist/src/main.js`.
- Frontend SPA routing fixed with Nginx `try_files` fallback to `index.html`.
- Frontend API base set via `frontend/.env` (`VITE_API_BASE`).

## Build / TypeScript Fixes
Frontend:
- Added `frontend/src/vite-env.d.ts` for `import.meta.env` typing.
- Fixed JSX/TSX issues in `frontend/src/App.tsx` after upstream changes.

Backend:
- Added definite assignment (`!`) to DTO fields to satisfy `strict` mode.
- Added `backend/src/types/pdfkit.d.ts` for missing `pdfkit` types.
- Fixed `nodemailer` import to avoid runtime `createTransport` undefined.
- Fixed Prisma client availability in final image by copying built `node_modules`.
- Resolved duplicate providers/controllers in `backend/src/app.module.ts`.

## Workflow / Feature Updates
### Requests lifecycle
- Employee can submit requests and withdraw them (withdraw returns to DRAFT).
- Approver can approve or disapprove; approval requires a reason.
- Finance can mark approved requests as reimbursed (PAID).

Backend endpoints added/used:
- `POST /requests/:id/submit`
- `POST /requests/:id/withdraw` (new)
- `POST /requests/:id/approve` (comment required)
- `POST /requests/:id/reject`
- `POST /requests/:id/finance/paid`

Validation changes:
- Submission no longer requires line items/receipts (UI doesn’t support them yet). It requires: category, reason, totalAmount > 0.

### History & visibility
- History views added for Employees, Approvers, and Finance with monthly filtering based on `submittedAt`.
- Approver history shows decisions the current approver made.
- Finance history shows reimbursements done by the current finance user.
- Requests now include `employee` and `actions` in list API for UI columns.
- Role-based navigation:
  - EMPLOYEE: Dashboard + My Requests
  - APPROVER: Dashboard + My Requests + Approval Queue
  - FINANCE_ADMIN: Dashboard + Finance Queue
  - SYSTEM_ADMIN: All tabs

## File Changes (Highlights)
Backend:
- `backend/Dockerfile` (Debian slim, openssl, correct entrypoint)
- `backend/src/requests/request.controller.ts` (withdraw endpoint)
- `backend/src/requests/request.service.ts` (withdraw, approval comment enforcement, finance payable status, list includes `employee`+`actions`)
- `backend/src/notifications/notification.service.ts` (nodemailer import)
- `backend/src/types/pdfkit.d.ts`
- `backend/prisma/seed.js` and `backend/package.json` seed script

Frontend:
- `frontend/Dockerfile` + `frontend/nginx.conf` (SPA routing)
- `frontend/.env` (VITE_API_BASE)
- `frontend/src/vite-env.d.ts`
- `frontend/src/App.tsx` (workflow actions, history views, role-based nav)
- `frontend/src/styles.css` (table actions)

Compose:
- `docker-compose.yml` (VITE_API_BASE set to VPS IP)

## Run / Deploy
From `/opt/benefits_app`:

```bash
docker compose up -d --build
```

Migrations / seed:
```bash
docker compose exec backend npm run migrate:deploy
docker compose exec backend npm run seed
```

## Known Limitations / Follow-ups
- No UI for line items or receipts (backend supports but UI does not).
- Approval/finance history uses action logs; ensure actions are present for legacy data.
- Role-based access is enforced in backend; UI hides tabs based on role.

