-- Emergency schema rollback for
-- 20260825014028_remove_closet_import_runs.sql.
--
-- This recreates the audited 2026-08-25 schema, grants, RLS policy, and
-- lifecycle comments. It intentionally does not embed the two production rows.
-- After this schema rollback succeeds, restore those rows from the ignored
-- data/local-exports/closet-import-runs-2026-08-25.restore.sql file.

begin;

create table public.closet_import_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces (id)
    on delete restrict,
  source text not null default 'notion',
  status text not null,
  source_snapshot_at timestamptz,
  counts jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint closet_import_runs_source_values
    check (source in ('notion', 'manual')),
  constraint closet_import_runs_status_values
    check (status in ('running', 'passed', 'failed'))
);

create index closet_import_runs_workspace_started_idx
on public.closet_import_runs (workspace_id, started_at desc);

revoke all on table public.closet_import_runs
from public, anon, authenticated, service_role;

grant select on table public.closet_import_runs
to authenticated;

grant all privileges on table public.closet_import_runs
to service_role;

alter table public.closet_import_runs enable row level security;

create policy closet_import_runs_select_member
on public.closet_import_runs
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

comment on table public.closet_import_runs
is '역할=초기 Notion to Supabase import 실행 기록; source_of_truth=아님, 일회성 실행 로그; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_import_runs.source
is '역할=가져오기 원본 식별; source_of_truth=import 실행 기록; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_import_runs.status
is '역할=가져오기 성공 상태; source_of_truth=import 실행 기록; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_import_runs.counts
is '역할=가져온 row 수 요약; source_of_truth=import 실행 기록; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_import_runs.report
is '역할=가져오기 검증 보고; source_of_truth=import 실행 기록; lifecycle=LEGACY_DROP_CANDIDATE';

commit;
