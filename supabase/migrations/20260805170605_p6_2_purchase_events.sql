-- P6-2 stores cumulative repurchase history separately from the manual
-- current-quantity snapshot. Event creation and snapshot replacement are
-- atomic through one controlled RPC; event corrections intentionally do not
-- recalculate or mutate the snapshot.

alter table public.closet_items
  add column current_quantity integer,
  add constraint closet_items_current_quantity_nonnegative
    check (current_quantity is null or current_quantity >= 0);

comment on column public.closet_items.current_quantity is
  '역할=직접 확인한 현재 보유 수량 snapshot; source_of_truth=수동 입력; lifecycle=LIVE_CORE; 자동 증감·이력 없음';

create table public.closet_purchase_events (
  id uuid primary key,
  workspace_id uuid not null
    references public.workspaces (id)
    on delete restrict,
  item_id uuid not null,
  purchased_on date not null,
  quantity integer not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint closet_purchase_events_quantity_positive
    check (quantity >= 1),
  constraint closet_purchase_events_item_owner_fkey
    foreign key (item_id, workspace_id)
    references public.closet_items (id, workspace_id)
    on delete cascade,
  constraint closet_purchase_events_id_workspace_unique
    unique (id, workspace_id)
);

comment on table public.closet_purchase_events is
  '역할=Item별 누적 재구매 사건; source_of_truth=수동 재구매 기록; lifecycle=LIVE_CORE; Item 삭제 시 함께 제거';
comment on column public.closet_purchase_events.purchased_on is
  '역할=현재 교체 주기 기준 후보 날짜; source_of_truth=수동 재구매 기록; lifecycle=LIVE_CORE';
comment on column public.closet_purchase_events.quantity is
  '역할=해당 사건에서 구매한 수량; source_of_truth=수동 재구매 기록; lifecycle=LIVE_CORE; 현재 수량 자동 증감에 사용하지 않음';

create index closet_purchase_events_item_date_idx
  on public.closet_purchase_events (
    workspace_id,
    item_id,
    purchased_on desc,
    created_at desc,
    id desc
  );

revoke all on table public.closet_purchase_events
from public, anon, authenticated;

grant select on table public.closet_purchase_events
to authenticated;

grant update (purchased_on, quantity, updated_at)
on table public.closet_purchase_events
to authenticated;

grant delete on table public.closet_purchase_events
to authenticated;

grant select, insert, update, delete
on table public.closet_purchase_events
to service_role;

grant update (current_quantity, updated_at)
on table public.closet_items
to authenticated;

alter table public.closet_purchase_events enable row level security;

create policy closet_purchase_events_select_member
on public.closet_purchase_events
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_purchase_events_update_member
on public.closet_purchase_events
for update
to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy closet_purchase_events_delete_member
on public.closet_purchase_events
for delete
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create or replace function private.validate_closet_purchase_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item_acquired_on date;
  korea_today date := (pg_catalog.now() at time zone 'Asia/Seoul')::date;
begin
  select item.acquired_on
  into item_acquired_on
  from public.closet_items item
  where item.workspace_id = new.workspace_id
    and item.id = new.item_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'purchase event item not found in workspace';
  end if;

  if new.purchased_on > korea_today then
    raise exception using
      errcode = '22023',
      message = 'purchase date cannot be in the future';
  end if;

  if item_acquired_on is not null
    and new.purchased_on < item_acquired_on
  then
    raise exception using
      errcode = '22023',
      message = 'purchase date cannot be before the initial acquisition date';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := pg_catalog.clock_timestamp();
  end if;

  return new;
end;
$$;

revoke all on function private.validate_closet_purchase_event()
from public, anon, authenticated, service_role;

create trigger closet_purchase_events_validate
before insert or update on public.closet_purchase_events
for each row execute function private.validate_closet_purchase_event();

create or replace function public.create_closet_purchase_event(
  p_workspace_id uuid,
  p_event_id uuid,
  p_item_id uuid,
  p_purchased_on date,
  p_quantity integer,
  p_current_quantity integer
)
returns public.closet_purchase_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_item public.closet_items;
  existing_event public.closet_purchase_events;
  saved_event public.closet_purchase_events;
  korea_today date := (pg_catalog.now() at time zone 'Asia/Seoul')::date;
begin
  if actor_id is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if p_event_id is null or p_item_id is null or p_purchased_on is null then
    raise exception using
      errcode = '22023',
      message = 'purchase event id, item, and date are required';
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception using
      errcode = '22023',
      message = 'purchase quantity must be a positive integer';
  end if;

  if p_current_quantity is null or p_current_quantity < 0 then
    raise exception using
      errcode = '22023',
      message = 'current quantity must be a nonnegative integer';
  end if;

  select item.*
  into current_item
  from public.closet_items item
  where item.workspace_id = p_workspace_id
    and item.id = p_item_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'purchase event item not found';
  end if;

  if p_purchased_on > korea_today then
    raise exception using
      errcode = '22023',
      message = 'purchase date cannot be in the future';
  end if;

  if current_item.acquired_on is not null
    and p_purchased_on < current_item.acquired_on
  then
    raise exception using
      errcode = '22023',
      message = 'purchase date cannot be before the initial acquisition date';
  end if;

  select event.*
  into existing_event
  from public.closet_purchase_events event
  where event.id = p_event_id;

  if found then
    if existing_event.workspace_id <> p_workspace_id
      or existing_event.item_id <> p_item_id
      or existing_event.purchased_on <> p_purchased_on
      or existing_event.quantity <> p_quantity
    then
      raise exception using
        errcode = '23505',
        message = 'purchase event id was already used with different content';
    end if;
    return existing_event;
  end if;

  insert into public.closet_purchase_events (
    id,
    workspace_id,
    item_id,
    purchased_on,
    quantity
  )
  values (
    p_event_id,
    p_workspace_id,
    p_item_id,
    p_purchased_on,
    p_quantity
  )
  returning * into saved_event;

  update public.closet_items item
  set current_quantity = p_current_quantity,
      updated_at = pg_catalog.clock_timestamp()
  where item.workspace_id = p_workspace_id
    and item.id = p_item_id;

  return saved_event;
end;
$$;

comment on function public.create_closet_purchase_event(
  uuid,
  uuid,
  uuid,
  date,
  integer,
  integer
) is
  '역할=재구매 사건과 저장 후 현재 수량을 원자 저장; source_of_truth=closet_purchase_events와 closet_items.current_quantity; lifecycle=LIVE_CORE; 두 쓰기가 분리 가능해질 때만 제거 검토';

revoke all on function public.create_closet_purchase_event(
  uuid,
  uuid,
  uuid,
  date,
  integer,
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.create_closet_purchase_event(
  uuid,
  uuid,
  uuid,
  date,
  integer,
  integer
) to authenticated;
