# DATA_MASTER / EDEN_DATA_MASTER Architecture

## Core principle
- `DATA_MASTER` remains the single source-of-truth for production data.
- `EDEN_DATA_MASTER` is Eden’s synchronized **full workspace** (not only a queue for user requests).
- Only admin final approval (`Apply to Master`) writes to `DATA_MASTER`.

## Canonical enums
- `Origin`
  - `REQUEST` – change started from a regular user request.
  - `EDEN_INITIATED` – change started directly by Eden.
- `ChangeType`
  - `UPDATE_EXISTING` – edits an existing `DATA_MASTER` record.
  - `NEW_RECORD` – proposes a brand-new record.

## EDEN_DATA_MASTER row model
Each active Eden row stores:
- Stable IDs: `RowID`, `CourseID`, `RequestID`
- Classification: `Origin`, `ChangeType`
- Synced source snapshot: `Source_*` (refreshed from `DATA_MASTER` for existing records)
- Eden draft: `Eden_*` (never overwritten by source refresh)
- Workflow/control:
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

## Flow matrix
### A) Existing record change (request or Eden-initiated)
1. A request/log row is created in `EDIT_REQUESTS` with `Origin` + `ChangeType=UPDATE_EXISTING`.
2. `EDEN_DATA_MASTER` row is created/updated with `Source_*` from `DATA_MASTER` and editable `Eden_*`.
3. Eden saves draft (`eden_saved`) and can submit to admin (`pending_final`).
4. Admin approve writes `Eden_*` delta into existing `DATA_MASTER` row.

### B) New record created by Eden
1. A request/log row is created in `EDIT_REQUESTS` with `Origin=EDEN_INITIATED`, `ChangeType=NEW_RECORD`.
2. A new workspace row is opened in `EDEN_DATA_MASTER`.
3. `Source_*` may stay empty; Eden fills `Eden_*`.
4. Admin approve creates a new record in `DATA_MASTER`.

## Synchronization policy
- `EDEN_DATA_MASTER` stays synchronized to `DATA_MASTER` by stable ID (`RowID`/`CourseID`) for `UPDATE_EXISTING`.
- Sync updates `Source_*`, `MasterLastUpdatedAt`, `LastSyncedAt`.
- Sync **must not overwrite** `Eden_*`.
- If master changed after Eden saved draft, set `HasMasterChangedAfterEdenEdit=true`.

## EDIT_REQUESTS policy
- `EDIT_REQUESTS` remains technical audit/workflow log.
- Every row must include `Origin` and `ChangeType`.

## Apply-to-master policy
- `Apply to Master` is admin-only.
- `UPDATE_EXISTING` -> update existing `DATA_MASTER` row.
- `NEW_RECORD` -> append new `DATA_MASTER` row.

## UI expectations (Eden screen)
- Start change on existing record.
- Start Eden-initiated new record.
- Save in Eden.
- Send to admin.
- Clear before/after presentation (`Source_*` vs `Eden_*`).
- Visible marker if master changed since last Eden save.
- Filter by origin (`REQUEST` / `EDEN_INITIATED`).

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
