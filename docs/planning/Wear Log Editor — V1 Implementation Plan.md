# Wear Log Editor — V1 Implementation Plan

## Goal

Create a small internal data-management tool inside Closet Index for inspecting and editing existing wear-log records in Supabase.

The immediate use case is correcting historical **Walk-related records for Phase 5**, but the tool should be structured so that it can later be reused for other wear-log maintenance tasks.

This is **not a new user-facing Closet Index feature**.

Think of it as:

> A compact Excel/Notion-style editor for existing wear-log data.

The main Closet Index app interprets and uses wear-log data.

This tool exists to inspect and maintain the underlying records.

---

# 1. Core Principles

## Reuse existing structures

Do not create a new table, RPC, staging table, migration table, or duplicate dataset for this feature unless the existing schema makes the feature genuinely impossible.

Before adding any database object, explain why the current schema cannot support the requirement.

Prefer:

1. existing tables
2. existing relations
3. normal Supabase queries
4. client-side transformation where reasonable

over adding backend infrastructure.

No database migration is expected for V1.

If a migration unexpectedly becomes necessary, stop and explain the reason before creating it. The user performs migrations manually.

---

## This is a maintenance UI, not a new data model

The editor must operate on the same wear-log records already used by Closet Index.

Do not introduce a second source of truth.

Do not import/export data merely to edit it.

Do not copy wear records into a temporary table.

---

## Keep V1 small

The purpose of V1 is:

- see many wear records at once
- find specific historical records quickly
- edit them safely
- verify the changes

Do not turn this into a general admin dashboard.

Do not add analytics, charts, statistics, AI features, or new recommendation logic.

---

# 2. First Step: Audit the Existing Wear-Log Structure

Before implementing the UI, inspect the current Closet Index code and Supabase schema.

Identify:

- the table that represents a wear/outfit record
- primary key
- date field
- Outfit relation
- Location relation or location field
- transport-related fields
- current Walk-related field(s)
- temperature fields
- subjective feeling / comfort fields
- any notes or metadata useful when identifying a record
- existing TypeScript types
- existing Supabase client/query utilities
- existing auth / RLS behavior
- any existing wear-log editing components that can be reused

Also identify how the current app edits these records.

Do not guess field names.

Document the actual fields before implementation.

---

# 3. Route

Add an internal tool page such as:

`/tools/wear-log`

This page does not need to appear in the normal Closet Index navigation.

It can remain a directly accessible internal route.

Reuse the existing Closet Index:

- Supabase client
- authentication
- application shell where convenient
- shared types
- shared UI primitives

Avoid creating a separate project unless there is a concrete technical reason.

---

# 4. Main UI

The primary interface should be a dense spreadsheet-like table.

Desktop usability is the priority.

The visual goal is closer to:

- Excel
- Notion database table
- Supabase table editor

than to normal Closet Index cards.

Avoid decorative UI.

Use compact rows, clear borders, small radius, and high information density.

---

# 5. Suggested Columns

The exact columns must follow the real schema discovered during the audit.

Display enough contextual information to identify each record easily.

Likely useful columns include:

| Column | Purpose |
|---|---|
| Date | Identify the wear record |
| Outfit | Identify the outfit |
| Location | Context |
| Transport | Current transport classification |
| Walk-related field(s) | Immediate Phase 5 editing target |
| Temp Out | Context |
| Temp Back | Context |
| Feeling / Comfort | Context |
| Notes | If useful |
| Record ID | Optional, preferably visually secondary |

Do not add new database fields simply because a useful display column does not exist.

Relational names can be displayed through existing joins.

---

# 6. Filtering

V1 needs strong filtering because the primary purpose is historical cleanup.

At minimum support:

### Date

- date range
- newest / oldest sorting

### Transport

- transport type
- Walk records

### Walk data

- Walk value
- missing / null Walk value

### Location

- location search or filter if the existing schema makes this straightforward

### General search

If inexpensive to implement, provide simple text search across useful display fields such as Outfit or Location.

The user should be able to reach a subset such as:

> historical Walk records with missing classification

without manually scanning the entire database.

---

# 7. Editing Model

The tool should behave like a data editor rather than opening individual record pages.

Prefer inline editing inside the table.

For enum-like fields, use a select.

For booleans, use the appropriate compact control.

For short text or numeric values, use normal inline inputs where appropriate.

---

## Editable-column configuration

Do not hard-code editing logic independently across the table.

Create a simple centralized configuration that defines which columns are editable.

For example conceptually:

- column key
- display label
- editable or read-only
- editor type
- allowed options
- formatter

This allows future wear-log fields to become editable without redesigning the table.

For V1, prioritize the fields required for the current Walk cleanup.

Other columns may remain read-only context until needed.

---

# 8. Safe Saving

Do not save every accidental click immediately.

Use a pending-change model.

When a cell is edited:

1. keep the change locally
2. visually mark the changed row/cell
3. show the number of unsaved changes

Provide:

- **Save Changes**
- **Discard Changes**

Saving should update only changed fields on the relevant records.

Do not overwrite untouched fields.

After saving:

1. confirm the Supabase update succeeded
2. re-fetch or otherwise verify the saved values
3. clear the pending-change state only after successful verification

If an update fails, retain the pending edits and show which record failed.

---

# 9. Bulk Editing

Bulk editing is important for this tool.

Allow row selection with checkboxes.

For selected rows, provide a simple bulk-edit control for supported editable fields.

Immediate example:

1. filter historical Walk records
2. select matching rows
3. assign the correct Walk classification
4. save

Do not build a complex spreadsheet engine.

Basic row selection + one-field bulk assignment is enough for V1.

---

# 10. Pagination / Data Volume

Do not assume the complete wear-log dataset is small enough to load indefinitely.

Inspect the current record count and query pattern.

Use either:

- sensible pagination
- or an existing project pagination/query pattern

Avoid infinite architectural work here.

The user should still be able to filter historical records efficiently.

---

# 11. Preserve Existing Behavior

The Wear Log Editor must not change:

- recommendation logic
- Phase 5 classification logic
- statistics
- maintenance logic
- existing wear-log creation flow
- existing Closet Index pages

This feature is only an alternate interface to existing data.

---

# 12. Database Lifecycle Rules

Follow the project database lifecycle rules.

Specifically:

- Do not turn a one-time cleanup task into a new production backend structure.
- Do not create staging/review/migration tables without explicit lifecycle/removal conditions.
- Before adding a table or RPC, explain why the existing structure cannot solve the problem.
- Do not preserve backend structures merely because a UI experiment once used them.
- Applied migration files may remain in history, but unused live schema should not be retained unnecessarily.
- Audit work must be read-only.
- Cleanup follows inventory → dependency check → export → removal → verification.

For this feature, the expected database change count is **zero**.

---

# 13. Testing Strategy

Keep testing proportional to the size of this internal tool.

Do not create a growing collection of one-off `test-*`, debug, temporary, or experimental files.

Reuse the project's existing test setup if one exists.

If no relevant automated test infrastructure exists, focus on a concise manual verification checklist rather than creating infrastructure solely for this page.

Minimum verification:

### Read

- records load correctly
- relational labels correspond to the correct records
- filters return expected rows
- sorting works

### Edit

- editing one Walk-related field updates only that record
- untouched columns remain unchanged
- cancel/discard restores original values

### Bulk edit

- selected records receive the intended value
- unselected records are unchanged

### Failure handling

- failed updates do not silently disappear
- unsaved state remains visible after failure

### Reload verification

After saving, reload/refetch the records and confirm the database contains the edited values.

---

# 14. V1 Non-Goals

Do not implement these unless required for the core editor:

- CSV export
- CSV import
- charts
- statistics
- recommendation previews
- automatic data correction
- AI classification
- audit-history system
- undo history across sessions
- schema editor
- generic Supabase admin features
- mobile-first UI
- new backend services

These can be reconsidered only if an actual future use case appears.

---

# 15. Expected V1 Workflow

A typical current workflow should be:

1. Open `/tools/wear-log`
2. Filter to Walk-related historical records
3. Optionally filter to records where the new Walk field is missing
4. Review Date / Outfit / Location / Transport / temperature context in one table
5. Edit individual records or select multiple rows
6. Assign the correct Walk value
7. Review highlighted pending changes
8. Save
9. Confirm that the saved values were re-fetched correctly

This workflow is the main acceptance criterion.

---

# 16. Implementation Sequence

## Step A — Read-only audit

Inspect the schema and existing code.

Report:

- actual source table(s)
- relevant columns
- relationships
- current editing path
- reusable components/utilities
- whether any database change appears necessary

Do not modify the database during this step.

---

## Step B — Read-only grid

Implement `/tools/wear-log`.

Add:

- table
- relevant columns
- sorting
- filters
- pagination if needed

Verify the displayed data against Supabase.

---

## Step C — Editing

Add:

- centralized editable-column configuration
- inline editing
- pending-change tracking
- Save Changes
- Discard Changes
- error handling
- post-save verification

Start with the Walk-related fields needed for Phase 5 cleanup.

---

## Step D — Bulk editing

Add:

- row selection
- select-all for the currently displayed/filtered set where safe
- bulk assignment for supported fields

Keep this intentionally simple.

---

## Step E — Final cleanup

Before considering V1 complete:

- remove debug code
- remove temporary files
- remove abandoned components
- confirm no unused backend structures were created
- confirm the feature does not alter existing Closet Index behavior
- verify actual Supabase values after editing

---

# Definition of Done

V1 is complete when I can open a single dense table, find old wear records using filters, edit Walk-related data directly, bulk-edit multiple records, save safely, and verify that the existing Supabase records were updated correctly.

No new database architecture is required merely to support the editor.

---

# 17. Approved Transport Taxonomy

Wear Log create/edit와 `/tools/wear-log`는 기존 `transport_mode_id` relation만 사용한다.

새로운 선택지는 다음과 같다.

- `도보 · 근거리`: 약 5~10분, 지속적인 보행 열부하가 거의 없는 이동
- `도보 · 지속`: 약 20~30분 이상이거나, 빠른 보행으로 체열이 뚜렷하게 증가하는 이동

10~20분 경계에서는 시간보다 실제 열부하를 우선한다.

- 열감 증가가 거의 없음: `도보 · 근거리`
- 땀, 뚜렷한 열감, 빠른 지속 보행: `도보 · 지속`

수동 production 전환 전의 기존 `도보` row는 새 기록 선택지에 노출하지 않는다. 그 ID를 이미 참조하는 기록을 편집할 때만 `도보 · 기존 기록`으로 표시해 다른 필드 수정이 Transport 변환을 강제하지 않도록 한다.

수동 전환 후에는 기존 row ID가 그대로 `도보 · 지속`이 되고, 새 `도보 · 근거리` row가 추가된다. 별도 legacy row, column, relation, `walk_unclassified` production option은 만들지 않는다.

초기 QA 대상은 human-reviewed 16건이다. 15건은 editor에서 `도보 · 근거리`로 바꾸고, sustained 1건은 기존 ID와 `도보 · 지속` 표시를 확인한다. production SQL과 데이터 수정은 별도 수동 단계에서만 수행한다.
