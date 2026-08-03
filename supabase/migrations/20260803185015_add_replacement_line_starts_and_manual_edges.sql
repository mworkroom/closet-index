alter table public.closet_replacement_line_edges
add column source_kind text not null default 'legacy_link';

alter table public.closet_replacement_line_edges
alter column source_legacy_link_id drop not null;

alter table public.closet_replacement_line_edges
add constraint closet_replacement_line_edges_source_kind
check (source_kind in ('legacy_link', 'manual'));

alter table public.closet_replacement_line_edges
add constraint closet_replacement_line_edges_source_contract
check (
  (source_kind = 'legacy_link' and source_legacy_link_id is not null)
  or (source_kind = 'manual' and source_legacy_link_id is null)
);

create table public.closet_replacement_line_starts (
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  replacement_line_id uuid not null,
  item_id uuid not null,
  designated_at timestamptz not null default now(),
  designated_by uuid not null references auth.users (id) on delete restrict,
  primary key (workspace_id, replacement_line_id, item_id),
  constraint closet_replacement_line_starts_line_owner_fkey
    foreign key (replacement_line_id, workspace_id)
    references public.closet_replacement_lines (id, workspace_id)
    on delete restrict,
  constraint closet_replacement_line_starts_membership_fkey
    foreign key (workspace_id, replacement_line_id, item_id)
    references public.closet_replacement_line_items (
      workspace_id,
      replacement_line_id,
      item_id
    )
    on delete restrict
);

create index closet_replacement_line_starts_designated_by_idx
on public.closet_replacement_line_starts (designated_by);

revoke all on table public.closet_replacement_line_starts
from public, anon, authenticated;

grant select on table public.closet_replacement_line_starts
to authenticated;

grant select, insert, delete on table public.closet_replacement_line_starts
to service_role;

alter table public.closet_replacement_line_starts enable row level security;

create policy closet_replacement_line_starts_select_member
on public.closet_replacement_line_starts
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create or replace function private.validate_closet_replacement_line_edge()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_link public.closet_replacement_legacy_links;
  expected_predecessor_id uuid;
  expected_successor_id uuid;
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

  if new.source_kind = 'legacy_link' then
    select link.*
    into source_link
    from public.closet_replacement_legacy_links link
    where link.id = new.source_legacy_link_id
      and link.workspace_id = new.workspace_id;

    if not found
      or source_link.review_status <> 'reviewed'
      or source_link.review_decision not in ('a_to_b', 'b_to_a')
    then
      raise exception using
        errcode = '23514',
        message = 'a confirmed directional legacy link is required';
    end if;

    if source_link.review_decision = 'a_to_b' then
      expected_predecessor_id := source_link.item_a_id;
      expected_successor_id := source_link.item_b_id;
    else
      expected_predecessor_id := source_link.item_b_id;
      expected_successor_id := source_link.item_a_id;
    end if;

    if new.predecessor_item_id <> expected_predecessor_id
      or new.successor_item_id <> expected_successor_id
    then
      raise exception using
        errcode = '23514',
        message = 'edge direction must match its reviewed legacy link';
    end if;
  end if;

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

drop trigger validate_closet_replacement_line_edge
on public.closet_replacement_line_edges;

create trigger validate_closet_replacement_line_edge
before insert or update of
  workspace_id,
  replacement_line_id,
  predecessor_item_id,
  successor_item_id,
  source_legacy_link_id,
  source_kind,
  status
on public.closet_replacement_line_edges
for each row
execute function private.validate_closet_replacement_line_edge();

create or replace function public.set_closet_replacement_line_start(
  p_workspace_id uuid,
  p_replacement_line_id uuid,
  p_item_id uuid,
  p_is_start boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if p_is_start is null then
    raise exception using
      errcode = '22023',
      message = 'start state is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_workspace_id::text || ':' || p_replacement_line_id::text,
      0
    )
  );

  if not exists (
    select 1
    from public.closet_replacement_line_items membership
    where membership.workspace_id = p_workspace_id
      and membership.replacement_line_id = p_replacement_line_id
      and membership.item_id = p_item_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'the start item must belong to the replacement line';
  end if;

  if p_is_start then
    if exists (
      select 1
      from public.closet_replacement_line_edges edge
      where edge.workspace_id = p_workspace_id
        and edge.replacement_line_id = p_replacement_line_id
        and edge.successor_item_id = p_item_id
        and edge.status = 'confirmed'
    ) then
      raise exception using
        errcode = '23514',
        message = 'an item with an incoming edge cannot be a start item';
    end if;

    insert into public.closet_replacement_line_starts (
      workspace_id,
      replacement_line_id,
      item_id,
      designated_by
    )
    values (
      p_workspace_id,
      p_replacement_line_id,
      p_item_id,
      (select auth.uid())
    )
    on conflict (workspace_id, replacement_line_id, item_id) do nothing;
  else
    delete from public.closet_replacement_line_starts start
    where start.workspace_id = p_workspace_id
      and start.replacement_line_id = p_replacement_line_id
      and start.item_id = p_item_id;
  end if;

  return exists (
    select 1
    from public.closet_replacement_line_starts start
    where start.workspace_id = p_workspace_id
      and start.replacement_line_id = p_replacement_line_id
      and start.item_id = p_item_id
  );
end;
$$;

revoke all on function public.set_closet_replacement_line_start(
  uuid,
  uuid,
  uuid,
  boolean
) from public, anon, authenticated;

grant execute on function public.set_closet_replacement_line_start(
  uuid,
  uuid,
  uuid,
  boolean
) to authenticated;

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
    source_legacy_link_id,
    source_kind,
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
    null,
    'manual',
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
) from public, anon, authenticated;

grant execute on function public.create_closet_replacement_manual_edge(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) to authenticated;

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
  source_link public.closet_replacement_legacy_links;
  revised_link public.closet_replacement_legacy_links;
  reversed_edge public.closet_replacement_line_edges;
  reversed_decision text;
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

  if current_edge.source_kind = 'legacy_link' then
    select link.*
    into source_link
    from public.closet_replacement_legacy_links link
    where link.id = current_edge.source_legacy_link_id
      and link.workspace_id = p_workspace_id
    for update;

    if not found
      or source_link.review_status <> 'reviewed'
      or source_link.review_decision not in ('a_to_b', 'b_to_a')
    then
      raise exception using
        errcode = '23514',
        message = 'a reviewed directional legacy link is required';
    end if;

    reversed_decision := case source_link.review_decision
      when 'a_to_b' then 'b_to_a'
      else 'a_to_b'
    end;

    select *
    into revised_link
    from public.revise_closet_replacement_legacy_link(
      p_workspace_id,
      source_link.id,
      source_link.updated_at,
      reversed_decision,
      source_link.review_reason
    );

    changed_at := greatest(
      clock_timestamp(),
      current_edge.updated_at + interval '1 microsecond',
      revised_link.updated_at + interval '1 microsecond'
    );
  else
    changed_at := greatest(
      clock_timestamp(),
      current_edge.updated_at + interval '1 microsecond'
    );
  end if;

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
    and edge.status = case
      when current_edge.source_kind = 'legacy_link' then 'needs_review'
      else 'confirmed'
    end
  returning * into reversed_edge;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'the replacement line edge could not be re-confirmed';
  end if;

  return reversed_edge;
end;
$$;

revoke all on function public.reverse_closet_replacement_line_edge(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.reverse_closet_replacement_line_edge(
  uuid,
  uuid,
  timestamptz
) to authenticated;
