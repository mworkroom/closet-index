alter table public.closet_replacement_lines
add column lifecycle_status text not null default 'active',
add column representative_line_id uuid,
add column archived_at timestamptz;

alter table public.closet_replacement_lines
add constraint closet_replacement_lines_lifecycle_status
check (lifecycle_status in ('active', 'archived')),
add constraint closet_replacement_lines_archive_contract
check (
  (
    lifecycle_status = 'active'
    and archived_at is null
    and representative_line_id is null
  )
  or (
    lifecycle_status = 'archived'
    and archived_at is not null
    and representative_line_id is distinct from id
  )
),
add constraint closet_replacement_lines_representative_owner_fkey
foreign key (representative_line_id, workspace_id)
references public.closet_replacement_lines (id, workspace_id)
on delete restrict;

create index closet_replacement_lines_workspace_lifecycle_idx
on public.closet_replacement_lines (workspace_id, lifecycle_status, name, id);

create index closet_replacement_lines_representative_workspace_fk_idx
on public.closet_replacement_lines (representative_line_id, workspace_id)
where representative_line_id is not null;

create or replace function private.require_active_closet_replacement_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_line_status text;
  new_line_status text;
begin
  if tg_op <> 'INSERT' then
    select line.lifecycle_status
    into old_line_status
    from public.closet_replacement_lines line
    where line.workspace_id = old.workspace_id
      and line.id = old.replacement_line_id;

    if old_line_status is distinct from 'active' then
      raise exception using
        errcode = '23514',
        message = 'archived replacement lines are read-only';
    end if;
  end if;

  if tg_op <> 'DELETE' then
    select line.lifecycle_status
    into new_line_status
    from public.closet_replacement_lines line
    where line.workspace_id = new.workspace_id
      and line.id = new.replacement_line_id;

    if new_line_status is distinct from 'active' then
      raise exception using
        errcode = '23514',
        message = 'archived replacement lines are read-only';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function private.require_active_closet_replacement_line()
from public, anon, authenticated, service_role;

create trigger require_active_closet_replacement_line_membership
before insert or update or delete
on public.closet_replacement_line_items
for each row
execute function private.require_active_closet_replacement_line();

create trigger require_active_closet_replacement_line_edge
before insert or update or delete
on public.closet_replacement_line_edges
for each row
execute function private.require_active_closet_replacement_line();

create trigger require_active_closet_replacement_line_start
before insert or update or delete
on public.closet_replacement_line_starts
for each row
execute function private.require_active_closet_replacement_line();

create or replace function public.set_closet_replacement_line_archived(
  p_workspace_id uuid,
  p_line_id uuid,
  p_archived boolean,
  p_expected_updated_at timestamptz
)
returns public.closet_replacement_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  current_line public.closet_replacement_lines;
  saved_line public.closet_replacement_lines;
begin
  if actor_id is null
    or not private.is_workspace_member(p_workspace_id)
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
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
      message = 'replacement line not found';
  end if;

  if current_line.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'replacement line changed; reload before saving';
  end if;

  if p_archived then
    if current_line.lifecycle_status <> 'active' then
      raise exception using
        errcode = '23514',
        message = 'replacement line is already archived';
    end if;

    if exists (
      select 1
      from public.closet_replacement_lines merged_line
      where merged_line.workspace_id = p_workspace_id
        and merged_line.representative_line_id = p_line_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'a representative line must be merged into another line instead of archived';
    end if;

    update public.closet_replacement_lines line
    set lifecycle_status = 'archived',
        representative_line_id = null,
        archived_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    where line.workspace_id = p_workspace_id
      and line.id = p_line_id
    returning line.* into saved_line;
  else
    if current_line.lifecycle_status <> 'archived' then
      raise exception using
        errcode = '23514',
        message = 'replacement line is already active';
    end if;

    if current_line.representative_line_id is not null then
      raise exception using
        errcode = '23514',
        message = 'a merged line cannot be restored directly';
    end if;

    update public.closet_replacement_lines line
    set lifecycle_status = 'active',
        representative_line_id = null,
        archived_at = null,
        updated_at = pg_catalog.clock_timestamp()
    where line.workspace_id = p_workspace_id
      and line.id = p_line_id
    returning line.* into saved_line;
  end if;

  return saved_line;
end;
$$;

comment on function public.set_closet_replacement_line_archived(
  uuid,
  uuid,
  boolean,
  timestamptz
) is 'Archives or restores a standalone replacement line while keeping its lineage data.';

revoke all on function public.set_closet_replacement_line_archived(
  uuid,
  uuid,
  boolean,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.set_closet_replacement_line_archived(
  uuid,
  uuid,
  boolean,
  timestamptz
) to authenticated;

create or replace function public.merge_closet_replacement_lines(
  p_workspace_id uuid,
  p_source_line_id uuid,
  p_target_line_id uuid,
  p_expected_source_updated_at timestamptz,
  p_expected_target_updated_at timestamptz
)
returns public.closet_replacement_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  source_line public.closet_replacement_lines;
  target_line public.closet_replacement_lines;
  saved_target public.closet_replacement_lines;
  changed_at timestamptz := pg_catalog.clock_timestamp();
begin
  if actor_id is null
    or not private.is_workspace_member(p_workspace_id)
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if p_source_line_id = p_target_line_id then
    raise exception using
      errcode = '23514',
      message = 'source and representative lines must be different';
  end if;

  perform 1
  from public.closet_replacement_lines line
  where line.workspace_id = p_workspace_id
    and line.id in (p_source_line_id, p_target_line_id)
  order by line.id
  for update;

  select line.*
  into source_line
  from public.closet_replacement_lines line
  where line.workspace_id = p_workspace_id
    and line.id = p_source_line_id;

  select line.*
  into target_line
  from public.closet_replacement_lines line
  where line.workspace_id = p_workspace_id
    and line.id = p_target_line_id;

  if source_line.id is null or target_line.id is null then
    raise exception using
      errcode = 'P0002',
      message = 'source or representative replacement line not found';
  end if;

  if source_line.lifecycle_status <> 'active'
    or target_line.lifecycle_status <> 'active'
  then
    raise exception using
      errcode = '23514',
      message = 'only active replacement lines can be merged';
  end if;

  if source_line.updated_at is distinct from p_expected_source_updated_at
    or target_line.updated_at is distinct from p_expected_target_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'replacement line changed; reload before merging';
  end if;

  if exists (
    select 1
    from public.closet_replacement_line_edges source_edge
    join public.closet_replacement_line_edges target_edge
      on target_edge.workspace_id = source_edge.workspace_id
     and target_edge.replacement_line_id = p_target_line_id
     and target_edge.predecessor_item_id = source_edge.predecessor_item_id
     and target_edge.successor_item_id = source_edge.successor_item_id
    where source_edge.workspace_id = p_workspace_id
      and source_edge.replacement_line_id = p_source_line_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'the two lines contain the same lineage edge; resolve it before merging';
  end if;

  if exists (
    with recursive combined_edges as (
      select edge.predecessor_item_id, edge.successor_item_id
      from public.closet_replacement_line_edges edge
      where edge.workspace_id = p_workspace_id
        and edge.replacement_line_id in (p_source_line_id, p_target_line_id)
        and edge.status = 'confirmed'
    ), paths (current_item_id, visited_item_ids, cyclic) as (
      select
        edge.successor_item_id,
        array[edge.predecessor_item_id, edge.successor_item_id],
        edge.predecessor_item_id = edge.successor_item_id
      from combined_edges edge

      union all

      select
        edge.successor_item_id,
        path.visited_item_ids || edge.successor_item_id,
        edge.successor_item_id = any(path.visited_item_ids)
      from paths path
      join combined_edges edge
        on edge.predecessor_item_id = path.current_item_id
      where not path.cyclic
    )
    select 1
    from paths
    where cyclic
  ) then
    raise exception using
      errcode = '23514',
      message = 'merging these lines would create a lineage cycle';
  end if;

  insert into public.closet_replacement_line_items (
    workspace_id,
    replacement_line_id,
    item_id,
    created_at
  )
  select
    membership.workspace_id,
    p_target_line_id,
    membership.item_id,
    membership.created_at
  from public.closet_replacement_line_items membership
  where membership.workspace_id = p_workspace_id
    and membership.replacement_line_id = p_source_line_id
  on conflict (workspace_id, replacement_line_id, item_id) do nothing;

  delete from public.closet_replacement_line_starts target_start
  using public.closet_replacement_line_edges source_edge
  where target_start.workspace_id = p_workspace_id
    and target_start.replacement_line_id = p_target_line_id
    and source_edge.workspace_id = p_workspace_id
    and source_edge.replacement_line_id = p_source_line_id
    and source_edge.status = 'confirmed'
    and source_edge.successor_item_id = target_start.item_id;

  update public.closet_replacement_line_edges edge
  set replacement_line_id = p_target_line_id,
      updated_at = changed_at
  where edge.workspace_id = p_workspace_id
    and edge.replacement_line_id = p_source_line_id;

  insert into public.closet_replacement_line_starts (
    workspace_id,
    replacement_line_id,
    item_id,
    designated_at,
    designated_by
  )
  select
    source_start.workspace_id,
    p_target_line_id,
    source_start.item_id,
    source_start.designated_at,
    source_start.designated_by
  from public.closet_replacement_line_starts source_start
  where source_start.workspace_id = p_workspace_id
    and source_start.replacement_line_id = p_source_line_id
    and not exists (
      select 1
      from public.closet_replacement_line_edges incoming_edge
      where incoming_edge.workspace_id = p_workspace_id
        and incoming_edge.replacement_line_id = p_target_line_id
        and incoming_edge.successor_item_id = source_start.item_id
        and incoming_edge.status = 'confirmed'
    )
  on conflict (workspace_id, replacement_line_id, item_id) do nothing;

  delete from public.closet_replacement_line_starts start
  where start.workspace_id = p_workspace_id
    and start.replacement_line_id = p_source_line_id;

  delete from public.closet_replacement_line_items membership
  where membership.workspace_id = p_workspace_id
    and membership.replacement_line_id = p_source_line_id;

  update public.closet_replacement_lines merged_line
  set representative_line_id = p_target_line_id,
      updated_at = changed_at
  where merged_line.workspace_id = p_workspace_id
    and merged_line.representative_line_id = p_source_line_id;

  update public.closet_replacement_lines line
  set lifecycle_status = 'archived',
      representative_line_id = p_target_line_id,
      archived_at = changed_at,
      review_status = 'needs_review',
      updated_at = changed_at
  where line.workspace_id = p_workspace_id
    and line.id = p_source_line_id;

  update public.closet_replacement_lines line
  set review_status = 'needs_review',
      updated_at = changed_at
  where line.workspace_id = p_workspace_id
    and line.id = p_target_line_id
  returning line.* into saved_target;

  return saved_target;
end;
$$;

comment on function public.merge_closet_replacement_lines(
  uuid,
  uuid,
  uuid,
  timestamptz,
  timestamptz
) is 'Moves one active replacement line into an active representative line and archives the source atomically.';

revoke all on function public.merge_closet_replacement_lines(
  uuid,
  uuid,
  uuid,
  timestamptz,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.merge_closet_replacement_lines(
  uuid,
  uuid,
  uuid,
  timestamptz,
  timestamptz
) to authenticated;
