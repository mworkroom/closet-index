create or replace function public.add_closet_replacement_line_item(
  p_workspace_id uuid,
  p_line_id uuid,
  p_item_id uuid,
  p_expected_updated_at timestamptz
)
returns public.closet_replacement_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_line public.closet_replacement_lines;
  actor_id uuid := (select auth.uid());
  changed_at timestamptz := clock_timestamp();
begin
  if actor_id is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if p_line_id is null or p_item_id is null or p_expected_updated_at is null then
    raise exception using
      errcode = '22023',
      message = 'line, item, and expected line timestamp are required';
  end if;

  perform 1
  from public.closet_items item
  where item.workspace_id = p_workspace_id
    and item.id = p_item_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'the closet item was not found';
  end if;

  select line.*
  into current_line
  from public.closet_replacement_lines line
  where line.workspace_id = p_workspace_id
    and line.id = p_line_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'the replacement line was not found';
  end if;

  if current_line.lifecycle_status <> 'active' then
    raise exception using
      errcode = '23514',
      message = 'items can only be added to an active replacement line';
  end if;

  if current_line.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'the replacement line changed; reload before adding the item';
  end if;

  if exists (
    select 1
    from public.closet_replacement_line_items membership
    where membership.workspace_id = p_workspace_id
      and membership.item_id = p_item_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'the item already belongs to a replacement line';
  end if;

  insert into public.closet_replacement_line_items (
    workspace_id,
    replacement_line_id,
    item_id
  )
  values (
    p_workspace_id,
    p_line_id,
    p_item_id
  );

  insert into public.closet_replacement_line_starts (
    workspace_id,
    replacement_line_id,
    item_id,
    designated_by
  )
  values (
    p_workspace_id,
    p_line_id,
    p_item_id,
    actor_id
  );

  update public.closet_replacement_lines line
  set review_status = 'needs_review',
      updated_at = changed_at
  where line.workspace_id = p_workspace_id
    and line.id = p_line_id
  returning line.* into current_line;

  return current_line;
end;
$$;

comment on function public.add_closet_replacement_line_item(
  uuid,
  uuid,
  uuid,
  timestamptz
) is 'Adds an unassigned Closet Item to one active Replacement Line as an explicit start and marks the Line for review.';

revoke all on function public.add_closet_replacement_line_item(
  uuid,
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.add_closet_replacement_line_item(
  uuid,
  uuid,
  uuid,
  timestamptz
) to authenticated;

create or replace function public.remove_closet_replacement_line_item(
  p_workspace_id uuid,
  p_source_line_id uuid,
  p_item_id uuid,
  p_expected_source_updated_at timestamptz
)
returns setof public.closet_replacement_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_line public.closet_replacement_lines;
  affected_line_ids uuid[];
  changed_at timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if p_source_line_id is null
    or p_item_id is null
    or p_expected_source_updated_at is null
  then
    raise exception using
      errcode = '22023',
      message = 'source line, item, and expected source timestamp are required';
  end if;

  perform 1
  from public.closet_items item
  where item.workspace_id = p_workspace_id
    and item.id = p_item_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'the closet item was not found';
  end if;

  perform 1
  from public.closet_replacement_lines line
  join public.closet_replacement_line_items membership
    on membership.workspace_id = line.workspace_id
   and membership.replacement_line_id = line.id
  where membership.workspace_id = p_workspace_id
    and membership.item_id = p_item_id
  order by line.id
  for update of line;

  select line.*
  into source_line
  from public.closet_replacement_lines line
  where line.workspace_id = p_workspace_id
    and line.id = p_source_line_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'the source replacement line was not found';
  end if;

  if source_line.lifecycle_status <> 'active' then
    raise exception using
      errcode = '23514',
      message = 'items can only be removed from an active replacement line';
  end if;

  if source_line.updated_at is distinct from p_expected_source_updated_at then
    raise exception using
      errcode = '40001',
      message = 'the source replacement line changed; reload before removing the item';
  end if;

  if not exists (
    select 1
    from public.closet_replacement_line_items membership
    where membership.workspace_id = p_workspace_id
      and membership.replacement_line_id = p_source_line_id
      and membership.item_id = p_item_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'the item does not belong to the source replacement line';
  end if;

  if exists (
    select 1
    from public.closet_replacement_line_edges edge
    where edge.workspace_id = p_workspace_id
      and (
        edge.predecessor_item_id = p_item_id
        or edge.successor_item_id = p_item_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'disconnect all lineage edges before removing the item from replacement lines';
  end if;

  select array_agg(distinct membership.replacement_line_id)
  into affected_line_ids
  from public.closet_replacement_line_items membership
  where membership.workspace_id = p_workspace_id
    and membership.item_id = p_item_id;

  delete from public.closet_replacement_line_starts start
  where start.workspace_id = p_workspace_id
    and start.item_id = p_item_id;

  delete from public.closet_replacement_line_items membership
  where membership.workspace_id = p_workspace_id
    and membership.item_id = p_item_id;

  return query
  update public.closet_replacement_lines line
  set review_status = 'needs_review',
      updated_at = changed_at
  where line.workspace_id = p_workspace_id
    and line.id = any(affected_line_ids)
  returning line.*;
end;
$$;

comment on function public.remove_closet_replacement_line_item(
  uuid,
  uuid,
  uuid,
  timestamptz
) is 'Removes an edge-free Closet Item from every Replacement Line, clears its explicit starts, and marks every affected Line for review.';

revoke all on function public.remove_closet_replacement_line_item(
  uuid,
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.remove_closet_replacement_line_item(
  uuid,
  uuid,
  uuid,
  timestamptz
) to authenticated;
