create table public.closet_replacement_line_edges (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  replacement_line_id uuid not null,
  predecessor_item_id uuid not null,
  successor_item_id uuid not null,
  source_legacy_link_id uuid not null,
  branch_name text,
  decision_reason text not null,
  status text not null default 'confirmed',
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closet_replacement_line_edges_status
    check (status in ('confirmed', 'needs_review', 'archived')),
  constraint closet_replacement_line_edges_not_self
    check (predecessor_item_id <> successor_item_id),
  constraint closet_replacement_line_edges_branch_name
    check (
      branch_name is null
      or (length(trim(branch_name)) > 0 and char_length(branch_name) <= 200)
    ),
  constraint closet_replacement_line_edges_reason
    check (
      length(trim(decision_reason)) > 0
      and char_length(decision_reason) <= 2000
    ),
  constraint closet_replacement_line_edges_id_workspace_unique
    unique (id, workspace_id),
  constraint closet_replacement_line_edges_source_unique
    unique (source_legacy_link_id),
  constraint closet_replacement_line_edges_direction_unique
    unique (
      workspace_id,
      replacement_line_id,
      predecessor_item_id,
      successor_item_id
    ),
  constraint closet_replacement_line_edges_line_owner_fkey
    foreign key (replacement_line_id, workspace_id)
    references public.closet_replacement_lines (id, workspace_id)
    on delete restrict,
  constraint closet_replacement_line_edges_predecessor_membership_fkey
    foreign key (workspace_id, replacement_line_id, predecessor_item_id)
    references public.closet_replacement_line_items (
      workspace_id,
      replacement_line_id,
      item_id
    )
    on delete restrict,
  constraint closet_replacement_line_edges_successor_membership_fkey
    foreign key (workspace_id, replacement_line_id, successor_item_id)
    references public.closet_replacement_line_items (
      workspace_id,
      replacement_line_id,
      item_id
    )
    on delete restrict,
  constraint closet_replacement_line_edges_source_owner_fkey
    foreign key (source_legacy_link_id, workspace_id)
    references public.closet_replacement_legacy_links (id, workspace_id)
    on delete restrict
);

create index closet_replacement_line_edges_workspace_line_status_idx
  on public.closet_replacement_line_edges (
    workspace_id,
    replacement_line_id,
    status,
    created_at,
    id
  );

create index closet_replacement_line_edges_line_workspace_fk_idx
  on public.closet_replacement_line_edges (replacement_line_id, workspace_id);

create index closet_replacement_line_edges_predecessor_idx
  on public.closet_replacement_line_edges (
    predecessor_item_id,
    workspace_id,
    replacement_line_id
  );

create index closet_replacement_line_edges_successor_idx
  on public.closet_replacement_line_edges (
    successor_item_id,
    workspace_id,
    replacement_line_id
  );

create index closet_replacement_line_edges_confirmed_by_idx
  on public.closet_replacement_line_edges (confirmed_by);

revoke all on table public.closet_replacement_line_edges
from public, anon, authenticated;

grant select on table public.closet_replacement_line_edges
to authenticated;

grant select, insert, update on table public.closet_replacement_line_edges
to service_role;

alter table public.closet_replacement_line_edges enable row level security;

create policy closet_replacement_line_edges_select_member
on public.closet_replacement_line_edges
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
from public, anon, authenticated;

create trigger validate_closet_replacement_line_edge
before insert or update of
  workspace_id,
  replacement_line_id,
  predecessor_item_id,
  successor_item_id,
  source_legacy_link_id,
  status
on public.closet_replacement_line_edges
for each row
execute function private.validate_closet_replacement_line_edge();

create or replace function private.mark_legacy_link_edge_needs_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.review_status is distinct from new.review_status
    or old.review_decision is distinct from new.review_decision
    or old.review_reason is distinct from new.review_reason
  then
    update public.closet_replacement_line_edges edge
    set
      status = 'needs_review',
      updated_at = greatest(clock_timestamp(), edge.updated_at + interval '1 microsecond')
    where edge.source_legacy_link_id = new.id
      and edge.workspace_id = new.workspace_id
      and edge.status = 'confirmed';
  end if;
  return new;
end;
$$;

revoke all on function private.mark_legacy_link_edge_needs_review()
from public, anon, authenticated;

create trigger mark_legacy_link_edge_needs_review
after update of review_status, review_decision, review_reason
on public.closet_replacement_legacy_links
for each row
execute function private.mark_legacy_link_edge_needs_review();

create or replace function public.confirm_closet_replacement_line_edge(
  p_workspace_id uuid,
  p_replacement_line_id uuid,
  p_source_legacy_link_id uuid,
  p_expected_legacy_updated_at timestamptz,
  p_branch_name text,
  p_decision_reason text
)
returns public.closet_replacement_line_edges
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_link public.closet_replacement_legacy_links;
  confirmed_edge public.closet_replacement_line_edges;
  predecessor_id uuid;
  successor_id uuid;
  normalized_branch_name text := nullif(trim(p_branch_name), '');
  normalized_reason text := trim(p_decision_reason);
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
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

  select link.*
  into source_link
  from public.closet_replacement_legacy_links link
  where link.id = p_source_legacy_link_id
    and link.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'legacy link was not found';
  end if;

  if p_expected_legacy_updated_at is null
    or source_link.updated_at is distinct from p_expected_legacy_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'the legacy link changed after it was loaded';
  end if;

  if source_link.review_status <> 'reviewed'
    or source_link.review_decision not in ('a_to_b', 'b_to_a')
  then
    raise exception using
      errcode = '22023',
      message = 'only a reviewed directional legacy link can become an edge';
  end if;

  if source_link.review_decision = 'a_to_b' then
    predecessor_id := source_link.item_a_id;
    successor_id := source_link.item_b_id;
  else
    predecessor_id := source_link.item_b_id;
    successor_id := source_link.item_a_id;
  end if;

  insert into public.closet_replacement_line_edges (
    workspace_id,
    replacement_line_id,
    predecessor_item_id,
    successor_item_id,
    source_legacy_link_id,
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
    predecessor_id,
    successor_id,
    p_source_legacy_link_id,
    normalized_branch_name,
    normalized_reason,
    'confirmed',
    now(),
    (select auth.uid()),
    now()
  )
  on conflict (source_legacy_link_id) do update
  set
    replacement_line_id = excluded.replacement_line_id,
    predecessor_item_id = excluded.predecessor_item_id,
    successor_item_id = excluded.successor_item_id,
    branch_name = excluded.branch_name,
    decision_reason = excluded.decision_reason,
    status = 'confirmed',
    confirmed_at = excluded.confirmed_at,
    confirmed_by = excluded.confirmed_by,
    updated_at = excluded.updated_at
  where closet_replacement_line_edges.workspace_id = excluded.workspace_id
    and closet_replacement_line_edges.status = 'needs_review'
  returning * into confirmed_edge;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'the legacy link already has a confirmed edge';
  end if;

  return confirmed_edge;
end;
$$;

revoke all on function public.confirm_closet_replacement_line_edge(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.confirm_closet_replacement_line_edge(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text
) to authenticated;
