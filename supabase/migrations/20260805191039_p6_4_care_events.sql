-- P6-4 needs a separate live event table because an Item column could keep
-- only the latest date and would lose the full history and method-at-event.
-- Each correction touches one row, so direct RLS-protected CRUD is sufficient;
-- no transaction wrapper or public RPC is required. Remove this table only if
-- care history, cycle calculation, and every UI consumer are retired together.

create table public.closet_care_events (
  id uuid primary key,
  workspace_id uuid not null
    references public.workspaces (id)
    on delete restrict,
  item_id uuid not null,
  cared_on date not null,
  care_method text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint closet_care_events_method_check
    check (care_method in ('hand_wash', 'dry_cleaning')),
  constraint closet_care_events_item_owner_fkey
    foreign key (item_id, workspace_id)
    references public.closet_items (id, workspace_id)
    on delete cascade,
  constraint closet_care_events_id_workspace_unique
    unique (id, workspace_id)
);

comment on table public.closet_care_events is
  '역할=Item별 누적 손세탁·드라이클리닝 사건; source_of_truth=수동 관리 기록; lifecycle=LIVE_CORE; 제거 조건=관리 이력·주기 계산·모든 UI 소비자 동시 폐기; Item 삭제 시 함께 제거';
comment on column public.closet_care_events.cared_on is
  '역할=현재 관리 주기 기준 후보 날짜; source_of_truth=수동 관리 기록; lifecycle=LIVE_CORE';
comment on column public.closet_care_events.care_method is
  '역할=사건 당시 관리 방식; source_of_truth=수동 관리 기록; lifecycle=LIVE_CORE; 현재 Category 판정과 독립적으로 보존';

create index closet_care_events_item_date_idx
  on public.closet_care_events (
    workspace_id,
    item_id,
    cared_on desc,
    created_at desc,
    id desc
  );

revoke all on table public.closet_care_events
from public, anon, authenticated;

grant select on table public.closet_care_events
to authenticated;

grant insert (id, workspace_id, item_id, cared_on, care_method)
on table public.closet_care_events
to authenticated;

grant update (cared_on, care_method)
on table public.closet_care_events
to authenticated;

grant delete on table public.closet_care_events
to authenticated;

grant select, insert, update, delete
on table public.closet_care_events
to service_role;

alter table public.closet_care_events enable row level security;

create policy closet_care_events_select_member
on public.closet_care_events
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_care_events_insert_member
on public.closet_care_events
for insert
to authenticated
with check ((select private.is_workspace_member(workspace_id)));

create policy closet_care_events_update_member
on public.closet_care_events
for update
to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy closet_care_events_delete_member
on public.closet_care_events
for delete
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create or replace function private.validate_closet_care_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  korea_today date := (pg_catalog.now() at time zone 'Asia/Seoul')::date;
begin
  if new.cared_on > korea_today then
    raise exception using
      errcode = '22023',
      message = 'care date cannot be in the future';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := pg_catalog.clock_timestamp();
  end if;

  return new;
end;
$$;

revoke all on function private.validate_closet_care_event()
from public, anon, authenticated, service_role;

create trigger closet_care_events_validate
before insert or update on public.closet_care_events
for each row execute function private.validate_closet_care_event();
