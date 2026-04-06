# DATA_MASTER / EDEN_DATA_MASTER Architecture

## Core principle
- `DATA_MASTER` is the only source-of-truth for production data.
- `EDEN_DATA_MASTER` is a synchronized **working queue** (not a second master).
- Only final admin approval writes to `DATA_MASTER`.

## EDEN row model
Each active Eden row keeps:
- Stable IDs: `RowID`, `CourseID`, `RequestID`
- Synced source snapshot: `Source_*` columns (refreshed from `DATA_MASTER`)
- Eden draft: `Eden_*` columns (never overwritten by source refresh)
- Workflow/control fields:
  - `WorkflowStatus`
  - `MasterLastUpdatedAt`
  - `LastSyncedAt`
  - `EdenLastSavedAt`
  - `SentToAdminAt`
  - `AdminDecision`
  - `AdminApprovedAt`
  - `AdminRejectedAt`
  - `EdenNotes`
  - `HasMasterChangedAfterEdenEdit`
  - `HasDiffBetweenSourceAndEden`

## Workflow statuses
- `pending_eden`
- `eden_saved`
- `pending_final`
- `final_approved`
- `final_rejected`
- `closed`

## Flow
1. User request created in `EDIT_REQUESTS` (audit/workflow log).
2. Row is created/updated in `EDEN_DATA_MASTER` with `Source_*` + `Eden_*` and `pending_eden`.
3. Eden edits `Eden_*` + `EdenNotes` and saves (`eden_saved`).
4. Eden submits to admin (`pending_final`) without writing to `DATA_MASTER`.
5. Admin approval applies `Eden_*` values to `DATA_MASTER`.
6. Admin rejection does not write to `DATA_MASTER` and marks Eden row `final_rejected`.

## Legacy sheet write policy
No operational writes to:
- `COURSES`
- `DASHBOARD_EXPORT`
- `REVIEW_REQUIRED`
- `SUMMARY`

## Finance view policy
- Payer rule remains:
  - `Funding = גפ"ן` -> payer is `School`
  - otherwise payer is `Funding`
- Main finance output is row-level per course/activity (not compressed aggregate-only view).
- Each row should keep full details (course/program/activity, authority, school, instructor, dates, meetings, payment/cost, funding, payer, status, notes).

## Ingestion source (current)
`DATA_MASTER` is currently fed by operational/manual process (no in-repo bootstrap ETL found).
