create or replace function public.update_closet_replacement_line_edge_connection(
  p_workspace_id uuid,
  p_edge_id uuid,
  p_expected_updated_at timestamptz,
  p_predecessor_item_id uuid,
  p_branch_name text,
  p_decision_reason text
)
returns public.closet_replacement_line_edges
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_edge public.closet_replacement_line_edges;
  updated_edge public.closet_replacement_line_edges;
  normalized_branch_name text := nullif(trim(p_branch_name), '');
  normalized_reason text := trim(p_decision_reason);
  changed_at timestamptz;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if normalized_reason not in ('단순 교체', '멸종 후 교체', '계승 👑') then
    raise exception using
      errcode = '22023',
      message = 'a supported edge decision reason is required';
  end if;

  if normalized_branch_name is not null
    and char_length(normalized_branch_name) > 200
  then
    raise exception using
      errcode = '22023',
      message = 'the branch name is too long';
  end if;

  select edge.*
  into current_edge
  from public.closet_replacement_line_edges edge
  where edge.id = p_edge_id
    and edge.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'replacement lineage edge was not found';
  end if;

  if p_expected_updated_at is null
    or current_edge.updated_at is distinct from p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'the replacement lineage edge changed after it was loaded';
  end if;

  if current_edge.status <> 'confirmed' then
    raise exception using
      errcode = '22023',
      message = 'only a confirmed replacement lineage edge can be revised';
  end if;

  if p_predecessor_item_id is null
    or p_predecessor_item_id = current_edge.successor_item_id
  then
    raise exception using
      errcode = '22023',
      message = 'a different predecessor item is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      current_edge.workspace_id::text || ':' || current_edge.replacement_line_id::text,
      0
    )
  );

  if not exists (
    select 1
    from public.closet_replacement_line_items membership
    where membership.workspace_id = current_edge.workspace_id
      and membership.replacement_line_id = current_edge.replacement_line_id
      and membership.item_id = p_predecessor_item_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'the predecessor item must belong to the replacement line';
  end if;

  if current_edge.predecessor_item_id = p_predecessor_item_id
    and current_edge.branch_name is not distinct from normalized_branch_name
    and current_edge.decision_reason = normalized_reason
  then
    raise exception using
      errcode = '22023',
      message = 'the replacement lineage edge has no changes';
  end if;

  changed_at := greatest(
    clock_timestamp(),
    current_edge.updated_at + interval '1 microsecond'
  );

  update public.closet_replacement_line_edges edge
  set
    predecessor_item_id = p_predecessor_item_id,
    source_legacy_link_id = null,
    source_kind = 'manual',
    branch_name = normalized_branch_name,
    decision_reason = normalized_reason,
    confirmed_at = changed_at,
    confirmed_by = (select auth.uid()),
    updated_at = changed_at
  where edge.id = current_edge.id
    and edge.workspace_id = p_workspace_id
  returning * into updated_edge;

  return updated_edge;
end;
$$;

revoke all on function public.update_closet_replacement_line_edge_connection(
  uuid,
  uuid,
  timestamptz,
  uuid,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.update_closet_replacement_line_edge_connection(
  uuid,
  uuid,
  timestamptz,
  uuid,
  text,
  text
) to authenticated, service_role;

create or replace function public.disconnect_closet_replacement_line_edge(
  p_workspace_id uuid,
  p_edge_id uuid,
  p_expected_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_edge public.closet_replacement_line_edges;
  should_be_start boolean;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  select edge.*
  into current_edge
  from public.closet_replacement_line_edges edge
  where edge.id = p_edge_id
    and edge.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'replacement lineage edge was not found';
  end if;

  if p_expected_updated_at is null
    or current_edge.updated_at is distinct from p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'the replacement lineage edge changed after it was loaded';
  end if;

  if current_edge.status <> 'confirmed' then
    raise exception using
      errcode = '22023',
      message = 'only a confirmed replacement lineage edge can be disconnected';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      current_edge.workspace_id::text || ':' || current_edge.replacement_line_id::text,
      0
    )
  );

  delete from public.closet_replacement_line_edges edge
  where edge.id = current_edge.id
    and edge.workspace_id = p_workspace_id;

  should_be_start := not exists (
    select 1
    from public.closet_replacement_line_edges edge
    where edge.workspace_id = current_edge.workspace_id
      and edge.replacement_line_id = current_edge.replacement_line_id
      and edge.successor_item_id = current_edge.successor_item_id
      and edge.status = 'confirmed'
  );

  if should_be_start then
    insert into public.closet_replacement_line_starts (
      workspace_id,
      replacement_line_id,
      item_id,
      designated_at,
      designated_by
    )
    values (
      current_edge.workspace_id,
      current_edge.replacement_line_id,
      current_edge.successor_item_id,
      clock_timestamp(),
      (select auth.uid())
    )
    on conflict (workspace_id, replacement_line_id, item_id)
    do update set
      designated_at = excluded.designated_at,
      designated_by = excluded.designated_by;
  end if;

  return should_be_start;
end;
$$;

revoke all on function public.disconnect_closet_replacement_line_edge(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.disconnect_closet_replacement_line_edge(
  uuid,
  uuid,
  timestamptz
) to authenticated, service_role;
