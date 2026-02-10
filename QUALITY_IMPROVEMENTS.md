# Quality Improvements

This document tracks planned, in-progress, and completed improvements to ExpenseFlow. Each entry includes a brief description, status, and date of completion where applicable.

---

## Planned

### Testing
- **Unit tests for authorization** — Verify manager-scoped approval logic, SYSTEM_ADMIN bypass, and team membership checks.
- **Budget validation tests** — Ensure budget deduction occurs on PAID status and respects allocation limits.
- **Admin CRUD tests** — Test user creation, update, deactivation, and password reset endpoints.
- **E2E browser tests** — Automated browser tests for login, request creation, approval flow, and admin panel.

### Features
- **Line items & receipts UI** — Expose backend line items and file upload functionality in the frontend.
- **Email notifications** — Notify employees on approval/rejection and approvers on new submissions.
- **Budget warnings** — Alert users when a request would exceed their remaining budget.
- **Bulk approval** — Allow approvers to approve/reject multiple requests at once.
- **Advanced reporting** — Export tables to CSV, monthly spend summaries by department.
- **Dark mode toggle** — Add a dark theme option alongside the current e-Ink light theme.

### Technical Debt
- **Component file splitting** — Further decompose `App.tsx` into individual component files per page.
- **React Query / SWR** — Replace manual `useEffect` data fetching with a caching library.
- **Form validation library** — Use Zod or Yup for client-side validation.
- **Error boundaries** — Add React error boundaries for graceful failure handling.

---

## In Progress

_None._

---

## Completed

| Date | Improvement | Notes |
|------|-------------|-------|
| 2026-02-09 | Initial deployment to VPS | Docker Compose setup, Prisma migrations, seed data |
| 2026-02-09 | Workflow actions (submit, withdraw, approve, reject, reimburse) | Full request lifecycle |
| 2026-02-09 | History views with monthly filtering | Employee, approver, and finance history |
| 2026-02-09 | Role-based navigation | Sidebar tabs restricted by user role |
| 2026-02-09 | Invoice fields (number, date, supplier) | Schema migration + UI forms + table columns |
| 2026-02-09 | Status color coding | Red (rejected), yellow (under review), green (paid) |
| 2026-02-09 | Approval comment requirement | Approvers must provide a reason |
| 2026-02-10 | Documentation consolidation | Merged DEPLOYMENT_NOTES.md + DEPLOYMENT_STEPS.md → CHANGELOG.md |
| 2026-02-10 | Manager hierarchy & scoped approvals | `managerId` on User, approvers see only direct reports |
| 2026-02-10 | Admin user management panel | Create, edit, deactivate users, assign roles/managers, reset passwords |
| 2026-02-10 | Annual budget allocations | BudgetAllocation model, auto-created on employee creation |
| 2026-02-10 | Budget dashboard visualization | Progress bars showing spent vs. remaining per category |
| 2026-02-10 | Budget deduction on payment | `BudgetAllocation.spent` incremented when BENEFIT request reaches PAID |
| 2026-02-10 | Expense type system | BENEFIT / TRAVEL / PROTOCOL types with category filtering |
| 2026-02-10 | Travel & Protocol workflows | New categories and expense type tabs in request form |
| 2026-02-10 | e-Ink minimalist UI redesign | Monochrome palette, Inter font, premium cards/pills/badges |
| 2026-02-10 | Component restructuring | Rewrote App.tsx with auth context, API helpers, admin panel |
| 2026-02-10 | Finance queue "Approved By" column | Shows who approved each request in finance view |
| 2026-02-10 | Return action for approvers | Approvers can return requests to employees for revision |
| 2026-02-10 | Extended JWT payload | `fullName` and `managerId` included in token |
| 2026-02-10 | 8-user seed with hierarchy | 2 approvers, 4 employees (2 per approver), 1 finance, 1 admin |
