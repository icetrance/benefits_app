# ExpenseFlow

ExpenseFlow is a single-tenant expense reimbursement platform with:
- **Manager-based approval hierarchy** — approvers see only their direct reports' requests
- **Three expense types** — Benefits (with annual budgets), Travel, Protocol
- **Budget tracking** — per-employee per-category annual allocations with visual progress bars
- **Admin interface** — user management, role assignment, manager hierarchy, password resets
- **Tamper-evident audit trail** — SHA-256 chained entries with integrity verification
- **Role-based access** — EMPLOYEE, APPROVER, FINANCE_ADMIN, SYSTEM_ADMIN

## Tech Stack

- **Backend**: Node.js + TypeScript + NestJS + PostgreSQL + Prisma
- **Frontend**: React + TypeScript + Vite
- **Auth**: JWT (email/password) + bcrypt
- **Design**: e-Ink minimalist aesthetic (Inter font, monochrome palette)
- **Infra**: Docker + Docker Compose + local uploads + Nodemailer

## Local Development

### 1) Start Postgres

```bash
docker compose up -d db
```

### 2) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run generate
npm run migrate
npm run seed
npm run start:dev
```

The backend is available at `http://localhost:3000` and Swagger docs at `http://localhost:3000/docs`.

### 3) Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The frontend is available at `http://localhost:5173`.

## Production Deployment (Linux VM)

### 1) Build and run services

```bash
docker compose up -d --build
```

### 2) Apply migrations and seed

```bash
docker compose exec backend npm run generate
docker compose exec backend npm run migrate:deploy
docker compose exec backend npm run seed
```

### 3) Access the app

- Backend: `http://<vm-ip>:3000`
- Frontend: `http://<vm-ip>:8080`

## Environment Variables

Backend (`backend/.env`):

- `DATABASE_URL` (required)
- `JWT_SECRET` (required)
- `UPLOAD_DIR` (default: `./uploads`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

Frontend (`frontend/.env`):

- `VITE_API_BASE` (required)

## Database Migration & Seeding

```bash
cd backend
npm run generate
npm run migrate:deploy
npm run seed
```

The seed script creates 8 users (2 approvers, 4 employees with manager assignments, 1 finance admin, 1 system admin), 5 expense categories, and budget allocations. Passwords are printed once at seed time.

## Backup Strategy

- **Postgres**: schedule `pg_dump` from the database container volume.
- **Uploads**: back up the `./uploads` directory alongside database dumps.

Example backup commands:

```bash
docker compose exec db pg_dump -U expenseflow expenseflow > backup.sql
cp -R uploads backups/uploads-$(date +%F)
```

## Nginx Reverse Proxy (optional)

```nginx
server {
  listen 80;
  server_name expenseflow.example.com;

  location / {
    proxy_pass http://localhost:8080;
  }

  location /api/ {
    proxy_pass http://localhost:3000/;
  }
}
```

## Updating to a New Version Safely

```bash
git pull origin main

docker compose up -d --build

docker compose exec backend npm run migrate:deploy
```

## Tests

```bash
cd backend
npm run test
```
