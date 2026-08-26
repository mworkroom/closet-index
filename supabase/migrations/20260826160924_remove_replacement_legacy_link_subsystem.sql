begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The cleanup changes both the lineage edge contract and its Legacy source
-- tables. Acquire the required locks before the preflight so no concurrent
-- review, reversal, lifecycle update, or direct service-role write can move
-- the validated snapshot while the subsystem is being removed. A busy
-- database aborts the whole transaction at the lock timeout.
lock table public.closet_replacement_lines
in share row exclusive mode;

lock table
  public.closet_replacement_legacy_links,
  public.closet_replacement_legacy_link_revisions,
  public.closet_replacement_line_edges
in access exclusive mode;

do $migration$
declare
  legacy_edge_ids uuid[];
  expected_edge_semantics jsonb;
  actual_edge_semantics jsonb;
  transitioned_count integer;
  locked_line record;
begin
  if exists (
    select 1
    from public.closet_replacement_line_edges edge
    left join public.closet_replacement_legacy_links link
      on link.id = edge.source_legacy_link_id
     and link.workspace_id = edge.workspace_id
    join public.closet_replacement_lines line
      on line.id = edge.replacement_line_id
     and line.workspace_id = edge.workspace_id
    where edge.source_kind = 'legacy_link'
      and (
        edge.source_legacy_link_id is null
        or edge.status <> 'confirmed'
        or line.lifecycle_status <> 'active'
        or link.id is null
        or link.review_status <> 'reviewed'
        or link.review_decision not in ('a_to_b', 'b_to_a')
        or not (
          (
            link.review_decision = 'a_to_b'
            and edge.predecessor_item_id = link.item_a_id
            and edge.successor_item_id = link.item_b_id
          )
          or
          (
            link.review_decision = 'b_to_a'
            and edge.predecessor_item_id = link.item_b_id
            and edge.successor_item_id = link.item_a_id
          )
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Legacy edge transition preflight failed';
  end if;

  for locked_line in
    select distinct edge.workspace_id, edge.replacement_line_id
    from public.closet_replacement_line_edges edge
    where edge.source_kind = 'legacy_link'
    order by edge.workspace_id, edge.replacement_line_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        locked_line.workspace_id::text
          || ':'
          || locked_line.replacement_line_id::text,
        0
      )
    );
  end loop;

  perform edge.id
  from public.closet_replacement_line_edges edge
  where edge.source_kind = 'legacy_link'
  order by edge.id
  for update;

  select
    coalesce(array_agg(edge.id order by edge.id), '{}'::uuid[]),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', edge.id,
          'workspace_id', edge.workspace_id,
          'replacement_line_id', edge.replacement_line_id,
          'predecessor_item_id', edge.predecessor_item_id,
          'successor_item_id', edge.successor_item_id,
          'branch_name', edge.branch_name,
          'decision_reason', edge.decision_reason,
          'status', edge.status,
          'confirmed_at', edge.confirmed_at,
          'confirmed_by', edge.confirmed_by,
          'created_at', edge.created_at,
          'updated_at', edge.updated_at
        )
        order by edge.id
      ),
      '[]'::jsonb
    )
  into legacy_edge_ids, expected_edge_semantics
  from public.closet_replacement_line_edges edge
  where edge.source_kind = 'legacy_link';

  update public.closet_replacement_line_edges edge
  set
    source_legacy_link_id = null,
    source_kind = 'manual'
  where edge.id = any(legacy_edge_ids)
    and edge.source_kind = 'legacy_link';

  get diagnostics transitioned_count = row_count;

  if transitioned_count <> cardinality(legacy_edge_ids) then
    raise exception using
      errcode = '40001',
      message = 'Legacy edge transition count changed concurrently';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', edge.id,
        'workspace_id', edge.workspace_id,
        'replacement_line_id', edge.replacement_line_id,
        'predecessor_item_id', edge.predecessor_item_id,
        'successor_item_id', edge.successor_item_id,
        'branch_name', edge.branch_name,
        'decision_reason', edge.decision_reason,
        'status', edge.status,
        'confirmed_at', edge.confirmed_at,
        'confirmed_by', edge.confirmed_by,
        'created_at', edge.created_at,
        'updated_at', edge.updated_at
      )
      order by edge.id
    ),
    '[]'::jsonb
  )
  into actual_edge_semantics
  from public.closet_replacement_line_edges edge
  where edge.id = any(legacy_edge_ids);

  if actual_edge_semantics is distinct from expected_edge_semantics then
    raise exception using
      errcode = '23514',
      message = 'Legacy edge semantics changed during transition';
  end if;

  if exists (
    select 1
    from public.closet_replacement_line_edges edge
    where edge.id = any(legacy_edge_ids)
      and (
        edge.source_kind <> 'manual'
        or edge.source_legacy_link_id is not null
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Legacy edge source fields were not cleared';
  end if;
end;
$migration$;

drop trigger mark_legacy_link_edge_needs_review
on public.closet_replacement_legacy_links;

drop function private.mark_legacy_link_edge_needs_review();

drop function public.confirm_closet_replacement_line_edges(uuid, jsonb);

drop function public.confirm_closet_replacement_line_edge(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text
);

drop function public.review_closet_replacement_legacy_link(
  uuid,
  uuid,
  text,
  text
);

create or replace function private.validate_closet_replacement_line_edge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      new.workspace_id::text || ':' || new.replacement_line_id::text,
      0
    )
  );

  if exists (
    select 1
    from public.closet_replacement_line_starts start
    where start.workspace_id = new.workspace_id
      and start.replacement_line_id = new.replacement_line_id
      and start.item_id = new.successor_item_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'an explicit start item cannot have an incoming edge';
  end if;

  if exists (
    with recursive descendants (item_id) as (
      select edge.successor_item_id
      from public.closet_replacement_line_edges edge
      where edge.workspace_id = new.workspace_id
        and edge.replacement_line_id = new.replacement_line_id
        and edge.status = 'confirmed'
        and edge.predecessor_item_id = new.successor_item_id
        and edge.id <> new.id

      union

      select edge.successor_item_id
      from public.closet_replacement_line_edges edge
      join descendants
        on descendants.item_id = edge.predecessor_item_id
      where edge.workspace_id = new.workspace_id
        and edge.replacement_line_id = new.replacement_line_id
        and edge.status = 'confirmed'
        and edge.id <> new.id
    )
    select 1
    from descendants
    where item_id = new.predecessor_item_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'replacement lineage edges must remain acyclic';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_closet_replacement_line_edge()
from public, anon, authenticated, service_role;

drop trigger validate_closet_replacement_line_edge
on public.closet_replacement_line_edges;

create trigger validate_closet_replacement_line_edge
before insert or update of
  workspace_id,
  replacement_line_id,
  predecessor_item_id,
  successor_item_id,
  status
on public.closet_replacement_line_edges
for each row
execute function private.validate_closet_replacement_line_edge();

create or replace function public.create_closet_replacement_manual_edge(
  p_workspace_id uuid,
  p_replacement_line_id uuid,
  p_predecessor_item_id uuid,
  p_successor_item_id uuid,
  p_branch_name text,
  p_decision_reason text
)
returns public.closet_replacement_line_edges
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_edge public.closet_replacement_line_edges;
  normalized_branch_name text := nullif(trim(p_branch_name), '');
  normalized_reason text := trim(p_decision_reason);
  changed_at timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if p_predecessor_item_id is null
    or p_successor_item_id is null
    or p_predecessor_item_id = p_successor_item_id
  then
    raise exception using
      errcode = '22023',
      message = 'two different items are required for a manual edge';
  end if;

  if normalized_reason is null or normalized_reason = '' then
    raise exception using
      errcode = '22023',
      message = 'an edge decision reason is required';
  end if;

  if char_length(normalized_reason) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'the edge decision reason is too long';
  end if;

  if normalized_branch_name is not null
    and char_length(normalized_branch_name) > 200
  then
    raise exception using
      errcode = '22023',
      message = 'the branch name is too long';
  end if;

  insert into public.closet_replacement_line_edges (
    workspace_id,
    replacement_line_id,
    predecessor_item_id,
    successor_item_id,
    branch_name,
    decision_reason,
    status,
    confirmed_at,
    confirmed_by,
    updated_at
  )
  values (
    p_workspace_id,
    p_replacement_line_id,
    p_predecessor_item_id,
    p_successor_item_id,
    normalized_branch_name,
    normalized_reason,
    'confirmed',
    changed_at,
    (select auth.uid()),
    changed_at
  )
  returning * into created_edge;

  return created_edge;
end;
$$;

revoke all on function public.create_closet_replacement_manual_edge(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.create_closet_replacement_manual_edge(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) to authenticated, service_role;

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

  if normalized_reason not in (
    '대체 시도',
    '온도 세분화',
    '기능 세분화',
    '계승 👑'
  ) then
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
      current_edge.workspace_id::text
        || ':'
        || current_edge.replacement_line_id::text,
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

create or replace function public.reverse_closet_replacement_line_edge(
  p_workspace_id uuid,
  p_edge_id uuid,
  p_expected_updated_at timestamptz
)
returns public.closet_replacement_line_edges
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_edge public.closet_replacement_line_edges;
  reversed_edge public.closet_replacement_line_edges;
  changed_at timestamptz;
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
      message = 'replacement line edge was not found';
  end if;

  if p_expected_updated_at is null
    or current_edge.updated_at is distinct from p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'the replacement line edge changed after it was loaded';
  end if;

  if current_edge.status <> 'confirmed' then
    raise exception using
      errcode = '22023',
      message = 'only a confirmed replacement line edge can be reversed';
  end if;

  changed_at := greatest(
    clock_timestamp(),
    current_edge.updated_at + interval '1 microsecond'
  );

  update public.closet_replacement_line_edges edge
  set
    predecessor_item_id = current_edge.successor_item_id,
    successor_item_id = current_edge.predecessor_item_id,
    status = 'confirmed',
    confirmed_at = changed_at,
    confirmed_by = (select auth.uid()),
    updated_at = changed_at
  where edge.id = current_edge.id
    and edge.workspace_id = p_workspace_id
    and edge.status = 'confirmed'
  returning * into reversed_edge;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'the replacement line edge could not be reversed';
  end if;

  return reversed_edge;
end;
$$;

revoke all on function public.reverse_closet_replacement_line_edge(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.reverse_closet_replacement_line_edge(
  uuid,
  uuid,
  timestamptz
) to authenticated, service_role;

drop function public.revise_closet_replacement_legacy_link(
  uuid,
  uuid,
  timestamptz,
  text,
  text
);

alter table public.closet_replacement_line_edges
drop constraint closet_replacement_line_edges_source_owner_fkey;

alter table public.closet_replacement_line_edges
drop constraint closet_replacement_line_edges_source_contract;

alter table public.closet_replacement_line_edges
drop constraint closet_replacement_line_edges_source_kind;

alter table public.closet_replacement_line_edges
drop constraint closet_replacement_line_edges_source_unique;

drop index public.closet_replacement_line_edges_source_workspace_fk_idx;

alter table public.closet_replacement_line_edges
drop column source_legacy_link_id;

alter table public.closet_replacement_line_edges
drop column source_kind;

drop table public.closet_replacement_legacy_link_revisions;

drop table public.closet_replacement_legacy_links;

comment on function public.reverse_closet_replacement_line_edge(
  uuid,
  uuid,
  timestamptz
) is
  '역할=edge 방향 반전; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';

commit;
