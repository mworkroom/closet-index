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

  select line.*
  into source_line
  from public.closet_replacement_lines line
  where line.workspace_id = p_workspace_id
    and line.id = p_source_line_id
  for update;

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
      and edge.replacement_line_id = p_source_line_id
      and (
        edge.predecessor_item_id = p_item_id
        or edge.successor_item_id = p_item_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'disconnect lineage edges in the source line before removing the item';
  end if;

  delete from public.closet_replacement_line_starts start
  where start.workspace_id = p_workspace_id
    and start.replacement_line_id = p_source_line_id
    and start.item_id = p_item_id;

  delete from public.closet_replacement_line_items membership
  where membership.workspace_id = p_workspace_id
    and membership.replacement_line_id = p_source_line_id
    and membership.item_id = p_item_id;

  return query
  update public.closet_replacement_lines line
  set review_status = 'needs_review',
      updated_at = changed_at
  where line.workspace_id = p_workspace_id
    and line.id = p_source_line_id
  returning line.*;
end;
$$;

comment on function public.remove_closet_replacement_line_item(
  uuid,
  uuid,
  uuid,
  timestamptz
) is 'Removes an edge-free Closet Item membership and explicit start from one source Replacement Line, preserves its other Line memberships and lineage, and marks only the source Line for review.';

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
