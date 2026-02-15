# Pending

Items below are the current backlog. Update after each session.

_Last updated: 2026-02-15 — Completed: currency dropdown, future date restriction, error messages, actioned-by column, approver view separation, approver self-service, audit trail nav fix, finance two-phase, auditor log, team pie chart, sign-out button contrast._

### Testing
- **Unit tests for authorization** — Verify manager-scoped approval logic, SYSTEM_ADMIN bypass, and team membership checks.
- **Budget validation tests** — Ensure budget deduction occurs on PAID status and respects allocation limits.
- **Admin CRUD tests** — Test user creation, update, deactivation, and password reset endpoints.
- **E2E browser tests** — Automated browser tests for login, request creation, approval flow, and admin panel.

### Features

#### General
- **Currency Conversion** — All RON amounts must have a corresponding EUR column. Reporting functions should standardize on EUR.

#### Requestor
- **Travel expense package** — Travel requests should support bundling multiple document types (transport, hotel, miscellaneous) into a single submission. Proposed solution: allow multiple line items with a type/category tag per line item, and support attaching multiple receipts per line item within one request. Requires line-item UI implementation first.

#### Other
- **Line items & receipts UI** — Expose backend line items and file upload functionality in the frontend.
- **Email notifications** — Notify employees on approval/rejection and approvers on new submissions.
- **Budget warnings** — Alert users when a request would exceed their remaining budget.
- **Bulk approval** — Allow approvers to approve/reject multiple requests at once.
- **Advanced reporting** — Export tables to CSV, monthly spend summaries by department.

### Technical Debt
- **Component file splitting** — Further decompose `App.tsx` into individual component files per page.
- **React Query / SWR** — Replace manual `useEffect` data fetching with a caching library.
- **Form validation library** — Use Zod or Yup for client-side validation.
- **Error boundaries** — Add React error boundaries for graceful failure handling.
