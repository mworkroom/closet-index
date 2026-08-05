-- General Items record rare repurchases without opting into quantity tracking.
-- A null p_current_quantity now means "preserve the existing snapshot" while
-- managed replacement categories continue to submit a nonnegative value.
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

  if p_current_quantity is not null and p_current_quantity < 0 then
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

  if p_current_quantity is not null then
    update public.closet_items item
    set current_quantity = p_current_quantity,
        updated_at = pg_catalog.clock_timestamp()
    where item.workspace_id = p_workspace_id
      and item.id = p_item_id;
  end if;

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
  '역할=재구매 사건을 저장하고 선택적으로 현재 수량도 원자 갱신; null current quantity는 기존 snapshot 보존; source_of_truth=closet_purchase_events와 closet_items.current_quantity; lifecycle=LIVE_CORE; 구매 이력 기능을 제거할 때만 제거 검토';
