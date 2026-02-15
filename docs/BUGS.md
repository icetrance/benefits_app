# Bugs

_All bugs listed below have been resolved as of 2026-02-15._

## Resolved

### General
- **[FIXED] UI/Contrast - Sign Out button**: Sign Out button now uses a dedicated `.sign-out-btn` class that is always readable against the sidebar (transparent background with subtle border, always white text). New Request button in dark mode now uses `.btn-primary` class with explicit dark mode overrides.
- **[FIXED] Approver cannot submit requests**: Backend `ensureTeamMember` now allows approvers to act on their own requests. Frontend My Requests filters to own requests only. Approver self-service fully enabled.
- **[FIXED] Currency field not a dropdown**: Currency is now a `<select>` with RON, EUR, USD options (default RON).

### Requestor
- **[FIXED] Future date booking allowed**: Invoice date input now has `max={TODAY_ISO}` preventing future date selection.
- **[FIXED] Vague error on request creation**: `useApi` helpers now parse backend JSON error response and surface the exact `message` field. Form errors and submit errors show actual backend reason.
- **[FIXED] Approver identity missing in history**: History table now has "Actioned By" column showing the actor's full name for the most recent decision action.
- **Travel expenses require multi-document package**: _Proposed solution documented in PENDING.md. Not yet implemented (requires line-item UI work)._

### Approver
- **[FIXED] Approver View Leak**: `listRequests` for APPROVER now returns own requests AND team requests. My Requests page filters to own only; Approval Queue filters to team only.
- **[FIXED] Audit Trail button visible for approvers**: Audit Trail nav link now only shown for SYSTEM_ADMIN and FINANCE_ADMIN. Approvers see no Audit Trail link.

### Finance
- **[FIXED] Single-phase finance approval**: Finance Queue now has two phases: Phase 1 (Document Review — Approve Docs or Return to Approver), Phase 2 (Reimbursement — Reimburse). New backend endpoints: `POST /requests/:id/finance/approve` and `POST /requests/:id/finance/return`. New `FINANCE_APPROVED` status added with DB migration.

### Auditor
- **[FIXED] No approval flow log**: New `/auditor-log` page shows all requests with complete action timeline (actor, role, status transitions, timestamps, comments). Backend endpoint `GET /requests/audit-log` returns full data for AUDITOR and SYSTEM_ADMIN roles.
