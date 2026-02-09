# Deployment Steps (Logged)

Date: 2026-02-09

This file captures the concrete steps performed to deploy and stabilize the application on the VPS, in order.

## 1) Clone repo to /opt
```bash
git clone https://github.com/icetrance/benefits_app /opt/benefits_app
```

## 2) Initial Docker Compose run
```bash
docker compose -f /opt/benefits_app/docker-compose.yml up -d --build
```

## 3) Frontend build fix (Vite env typing)
- Added `frontend/src/vite-env.d.ts`
- Rebuild

## 4) Backend TS strict fixes + types
- Added definite assignment (`!`) to DTO fields
- Added `backend/src/types/pdfkit.d.ts`
- Fixed `nodemailer` import

## 5) Backend runtime fixes
- Backend Dockerfile entrypoint changed to `dist/src/main.js`
- Copied built `node_modules` into runtime image
- Switched backend image to `node:18-bullseye-slim`
- Installed `openssl` in runtime layer to satisfy Prisma engine

## 6) Frontend SPA routing
- Added `frontend/nginx.conf` with `try_files $uri /index.html`
- Dockerfile copies this config

## 7) API base fix
- Set `frontend/.env` to `VITE_API_BASE=http://<VPS_IP>:3000`
- Rebuilt containers

## 8) Database migration + seed
```bash
docker compose exec backend npm run migrate:deploy
docker compose exec backend npm run seed
```

## 9) Seed runner reliability
- Added JS seed file `backend/prisma/seed.js`
- Updated `package.json` prisma seed to `node prisma/seed.js`

## 10) Workflow actions added
Backend:
- `POST /requests/:id/submit`
- `POST /requests/:id/withdraw`
- `POST /requests/:id/approve` (comment required)
- `POST /requests/:id/reject`
- `POST /requests/:id/finance/paid`

Frontend:
- Added Submit/Withdraw/Approve/Disapprove/Reimburse buttons
- Added approval comment prompts

## 11) History views (monthly)
- Added history sections for Employee/Approver/Finance
- Monthly filter uses `submittedAt`
- Added submitted-by/at and decision/reimbursed timestamps

## 12) Role-based navigation and access
- Employee: Dashboard + My Requests
- Approver: Dashboard + My Requests + Approval Queue
- Finance: Dashboard + Finance Queue
- System Admin: All tabs

## 13) Fixes for queue visibility
- Open vs history separation
- Approver history shows decided items
- Finance queue shows APPROVED/PAYMENT_PROCESSING
- Finance history shows reimbursed items

## 14) Invoice fields
Backend:
- Added `invoiceNumber`, `invoiceDate`, `supplier` to Prisma schema and DTOs
- Migrated DB: `npx prisma migrate dev --name add_invoice_fields`

Frontend:
- Added invoice fields to create form
- Added invoice columns to all tables

## 15) Required fields
- Create request: all fields required
- Disapprove: comment required (backend + prompt)

## 16) Status colors
- REJECTED: red
- UNDER_REVIEW: yellow
- PAID: green

## 17) History comment column for requestors
- Added comment column in employee history (latest decision comment)

## 18) Latest deploy
```bash
docker compose up -d --build
```

