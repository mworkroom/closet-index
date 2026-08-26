-- Emergency schema rollback for
-- 20260826160924_remove_replacement_legacy_link_subsystem.sql.
--
-- This recreates the audited Legacy Link schema, constraints, indexes, RLS,
-- grants, triggers, and RPC behavior. It intentionally does not embed
-- production rows. After this schema rollback succeeds, restore the 49 links,
-- 51 revisions, and 18 source associations from the ignored local export.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.closet_replacement_lines
in share row exclusive mode;

lock table public.closet_replacement_line_edges
in access exclusive mode;

do $rollback_preflight$
begin
  if to_regclass('public.closet_replacement_legacy_links') is not null
    or to_regclass('public.closet_replacement_legacy_link_revisions') is not null
    or exists (
      select 1
      from pg_catalog.pg_attribute attribute
      where attribute.attrelid = 'public.closet_replacement_line_edges'::regclass
        and attribute.attname in ('source_legacy_link_id', 'source_kind')
        and attribute.attnum > 0
        and not attribute.attisdropped
    )
  then
    raise exception using
      errcode = '55000',
      message = 'Legacy Link rollback requires the post-cleanup schema';
  end if;
end;
$rollback_preflight$;

create table public.closet_replacement_legacy_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces (id)
    on delete restrict,
  item_a_id uuid not null,
  item_b_id uuid not null,
  source text not null default 'notion_replaces',
  source_item_a_notion_page_id uuid not null,
  source_item_b_notion_page_id uuid not null,
  review_status text not null default 'pending',
  review_decision text,
  review_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid
    references auth.users (id)
    on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closet_replacement_legacy_links_pair_order
    check (item_a_id < item_b_id),
  constraint closet_replacement_legacy_links_source_pair_order
    check (source_item_a_notion_page_id < source_item_b_notion_page_id),
  constraint closet_replacement_legacy_links_source
    check (source = 'notion_replaces'),
  constraint closet_replacement_legacy_links_review_status
    check (review_status in ('pending', 'reviewed')),
  constraint closet_replacement_legacy_links_review_decision
    check (
      review_decision is null
      or review_decision in ('a_to_b', 'b_to_a', 'parallel', 'not_replacement')
    ),
  constraint closet_replacement_legacy_links_reason_length
    check (review_reason is null or char_length(review_reason) <= 2000),
  constraint closet_replacement_legacy_links_review_state
    check (
      (
        review_status = 'pending'
        and review_decision is null
        and review_reason is null
        and reviewed_at is null
        and reviewed_by is null
      )
      or
      (
        review_status = 'reviewed'
        and review_decision is not null
        and review_reason is not null
        and length(trim(review_reason)) > 0
        and reviewed_at is not null
        and reviewed_by is not null
      )
    ),
  constraint closet_replacement_legacy_links_workspace_pair_unique
    unique (workspace_id, item_a_id, item_b_id),
  constraint closet_replacement_legacy_links_id_workspace_unique
    unique (id, workspace_id),
  constraint closet_replacement_legacy_links_item_a_owner_fkey
    foreign key (item_a_id, workspace_id)
    references public.closet_items (id, workspace_id)
    on delete restrict,
  constraint closet_replacement_legacy_links_item_b_owner_fkey
    foreign key (item_b_id, workspace_id)
    references public.closet_items (id, workspace_id)
    on delete restrict
);

create index closet_replacement_legacy_links_workspace_status_idx
on public.closet_replacement_legacy_links (
  workspace_id,
  review_status,
  created_at,
  id
);

create index closet_replacement_legacy_links_workspace_item_a_idx
on public.closet_replacement_legacy_links (workspace_id, item_a_id);

create index closet_replacement_legacy_links_workspace_item_b_idx
on public.closet_replacement_legacy_links (workspace_id, item_b_id);

create index closet_replacement_legacy_links_item_a_workspace_fk_idx
on public.closet_replacement_legacy_links (item_a_id, workspace_id);

create index closet_replacement_legacy_links_item_b_workspace_fk_idx
on public.closet_replacement_legacy_links (item_b_id, workspace_id);

create index closet_replacement_legacy_links_reviewed_by_fk_idx
on public.closet_replacement_legacy_links (reviewed_by)
where reviewed_by is not null;

revoke all on table public.closet_replacement_legacy_links
from public, anon, authenticated, service_role;

grant select on table public.closet_replacement_legacy_links
to authenticated;

grant select, insert on table public.closet_replacement_legacy_links
to service_role;

alter table public.closet_replacement_legacy_links
enable row level security;

create policy closet_replacement_legacy_links_select_member
on public.closet_replacement_legacy_links
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create table public.closet_replacement_legacy_link_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null
    references public.workspaces (id)
    on delete restrict,
  legacy_link_id uuid not null,
  revision_number integer not null,
  decision text not null,
  reason text not null,
  reviewed_at timestamptz not null,
  reviewed_by uuid not null
    references auth.users (id)
    on delete restrict,
  created_at timestamptz not null default now(),
  constraint closet_replacement_legacy_link_revisions_revision_positive
    check (revision_number > 0),
  constraint closet_replacement_legacy_link_revisions_decision
    check (decision in ('a_to_b', 'b_to_a', 'parallel', 'not_replacement')),
  constraint closet_replacement_legacy_link_revisions_reason
    check (length(trim(reason)) > 0 and char_length(reason) <= 2000),
  constraint closet_replacement_legacy_link_revisions_link_revision_unique
    unique (legacy_link_id, revision_number),
  constraint closet_replacement_legacy_link_revisions_link_owner_fkey
    foreign key (legacy_link_id, workspace_id)
    references public.closet_replacement_legacy_links (id, workspace_id)
    on delete restrict
);

create index closet_replacement_legacy_link_revisions_workspace_created_idx
on public.closet_replacement_legacy_link_revisions (
  workspace_id,
  created_at desc,
  id
);

create index closet_replacement_legacy_link_revisions_link_workspace_fk_idx
on public.closet_replacement_legacy_link_revisions (
  legacy_link_id,
  workspace_id
);

create index closet_replacement_legacy_link_revisions_reviewed_by_fk_idx
on public.closet_replacement_legacy_link_revisions (reviewed_by);

revoke all on table public.closet_replacement_legacy_link_revisions
from public, anon, authenticated, service_role;

grant select on table public.closet_replacement_legacy_link_revisions
to authenticated;

grant select, insert on table public.closet_replacement_legacy_link_revisions
to service_role;

alter table public.closet_replacement_legacy_link_revisions
enable row level security;

create policy closet_replacement_legacy_link_revisions_select_member
on public.closet_replacement_legacy_link_revisions
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

alter table public.closet_replacement_line_edges
add column source_legacy_link_id uuid;

-- Existing post-cleanup edges are initialized as manual. The historic
-- legacy_link default is restored only after the current rows satisfy the
-- source contract; the ignored data restore later reconnects 18 rows.
alter table public.closet_replacement_line_edges
add column source_kind text not null default 'manual';

alter table public.closet_replacement_line_edges
add constraint closet_replacement_line_edges_source_kind
check (source_kind in ('legacy_link', 'manual'));

alter table public.closet_replacement_line_edges
add constraint closet_replacement_line_edges_source_contract
check (
  (source_kind = 'legacy_link' and source_legacy_link_id is not null)
  or (source_kind = 'manual' and source_legacy_link_id is null)
);

alter table public.closet_replacement_line_edges
add constraint closet_replacement_line_edges_source_unique
unique (source_legacy_link_id);

alter table public.closet_replacement_line_edges
add constraint closet_replacement_line_edges_source_owner_fkey
foreign key (source_legacy_link_id, workspace_id)
references public.closet_replacement_legacy_links (id, workspace_id)
on delete restrict;

create index closet_replacement_line_edges_source_workspace_fk_idx
on public.closet_replacement_line_edges (
  source_legacy_link_id,
  workspace_id
);

alter table public.closet_replacement_line_edges
alter column source_kind set default 'legacy_link';

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
  source_legacy_link_id,
  source_kind,
  status
on public.closet_replacement_line_edges
for each row
execute function private.validate_closet_replacement_line_edge();

create or replace function public.revise_closet_replacement_legacy_link(
  p_workspace_id uuid,
  p_link_id uuid,
  p_expected_updated_at timestamptz,
  p_decision text,
  p_reason text
)
returns public.closet_replacement_legacy_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_link public.closet_replacement_legacy_links;
  revised_link public.closet_replacement_legacy_links;
  normalized_reason text := trim(p_reason);
  next_revision_number integer;
  changed_at timestamptz;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if p_decision is null
    or not (
      p_decision = any(
        array['a_to_b', 'b_to_a', 'parallel', 'not_replacement']::text[]
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'a valid legacy link decision is required';
  end if;

  if normalized_reason is null or normalized_reason = '' then
    raise exception using
      errcode = '22023',
      message = 'a review reason is required';
  end if;

  if char_length(normalized_reason) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'the review reason is too long';
  end if;

  select link.*
  into current_link
  from public.closet_replacement_legacy_links link
  where link.id = p_link_id
    and link.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'legacy link was not found';
  end if;

  if p_expected_updated_at is null
    or current_link.updated_at is distinct from p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'the legacy link changed after it was loaded';
  end if;

  if current_link.review_status = 'reviewed'
    and current_link.review_decision = p_decision
    and current_link.review_reason = normalized_reason
  then
    raise exception using
      errcode = '22023',
      message = 'the review has no changes';
  end if;

  select coalesce(max(revision.revision_number), 0) + 1
  into next_revision_number
  from public.closet_replacement_legacy_link_revisions revision
  where revision.legacy_link_id = p_link_id;

  changed_at := greatest(
    clock_timestamp(),
    current_link.updated_at + interval '1 microsecond'
  );

  update public.closet_replacement_legacy_links link
  set
    review_status = 'reviewed',
    review_decision = p_decision,
    review_reason = normalized_reason,
    reviewed_at = changed_at,
    reviewed_by = (select auth.uid()),
    updated_at = changed_at
  where link.id = p_link_id
    and link.workspace_id = p_workspace_id
  returning * into revised_link;

  insert into public.closet_replacement_legacy_link_revisions (
    workspace_id,
    legacy_link_id,
    revision_number,
    decision,
    reason,
    reviewed_at,
    reviewed_by,
    created_at
  )
  values (
    p_workspace_id,
    p_link_id,
    next_revision_number,
    p_decision,
    normalized_reason,
    changed_at,
    (select auth.uid()),
    changed_at
  );

  return revised_link;
end;
$$;

revoke all on function public.revise_closet_replacement_legacy_link(
  uuid,
  uuid,
  timestamptz,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.revise_closet_replacement_legacy_link(
  uuid,
  uuid,
  timestamptz,
  text,
  text
) to authenticated, service_role;

create or replace function public.review_closet_replacement_legacy_link(
  p_workspace_id uuid,
  p_link_id uuid,
  p_decision text,
  p_reason text
)
returns public.closet_replacement_legacy_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_link public.closet_replacement_legacy_links;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  select link.*
  into pending_link
  from public.closet_replacement_legacy_links link
  where link.id = p_link_id
    and link.workspace_id = p_workspace_id
    and link.review_status = 'pending';

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'pending legacy link was not found';
  end if;

  return public.revise_closet_replacement_legacy_link(
    p_workspace_id,
    p_link_id,
    pending_link.updated_at,
    p_decision,
    p_reason
  );
end;
$$;

revoke all on function public.review_closet_replacement_legacy_link(
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.review_closet_replacement_legacy_link(
  uuid,
  uuid,
  text,
  text
) to authenticated, service_role;

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
      updated_at = greatest(
        clock_timestamp(),
        edge.updated_at + interval '1 microsecond'
      )
    where edge.source_legacy_link_id = new.id
      and edge.workspace_id = new.workspace_id
      and edge.status = 'confirmed';
  end if;

  return new;
end;
$$;

revoke all on function private.mark_legacy_link_edge_needs_review()
from public, anon, authenticated, service_role;

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
) from public, anon, authenticated, service_role;

grant execute on function public.confirm_closet_replacement_line_edge(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text
) to authenticated, service_role;

create or replace function public.confirm_closet_replacement_line_edges(
  p_workspace_id uuid,
  p_candidates jsonb
)
returns setof public.closet_replacement_line_edges
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  confirmed_edge public.closet_replacement_line_edges;
  candidate_count integer;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'edge candidates must be a JSON array';
  end if;

  candidate_count := jsonb_array_length(p_candidates);
  if candidate_count < 1 or candidate_count > 200 then
    raise exception using
      errcode = '22023',
      message = 'between 1 and 200 edge candidates are required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_candidates) as entry(source_legacy_link_id uuid)
    group by entry.source_legacy_link_id
    having entry.source_legacy_link_id is null or count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'edge candidate source links must be present and unique';
  end if;

  for candidate in
    select entry.*
    from jsonb_to_recordset(p_candidates) as entry(
      replacement_line_id uuid,
      source_legacy_link_id uuid,
      expected_legacy_updated_at timestamptz,
      branch_name text,
      decision_reason text
    )
    order by entry.replacement_line_id, entry.source_legacy_link_id
  loop
    if candidate.replacement_line_id is null
      or candidate.expected_legacy_updated_at is null
    then
      raise exception using
        errcode = '22023',
        message = 'each edge candidate requires a Line and expected timestamp';
    end if;

    select *
    into confirmed_edge
    from public.confirm_closet_replacement_line_edge(
      p_workspace_id,
      candidate.replacement_line_id,
      candidate.source_legacy_link_id,
      candidate.expected_legacy_updated_at,
      candidate.branch_name,
      candidate.decision_reason
    );

    return next confirmed_edge;
  end loop;

  return;
end;
$$;

revoke all on function public.confirm_closet_replacement_line_edges(uuid, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.confirm_closet_replacement_line_edges(uuid, jsonb)
to authenticated, service_role;

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

  if normalized_reason not in ('대체 시도', '온도 세분화', '기능 세분화', '계승 👑') then
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
) from public, anon, authenticated, service_role;

grant execute on function public.reverse_closet_replacement_line_edge(
  uuid,
  uuid,
  timestamptz
) to authenticated, service_role;

comment on table public.closet_replacement_legacy_links
is '역할=Notion의 무방향 관계 49개와 사람의 방향 검토 결과; source_of_truth=과도기 Legacy 판단; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_replacement_legacy_links.item_a_id
is '역할=canonical pair Item A; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_replacement_legacy_links.item_b_id
is '역할=canonical pair Item B; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_replacement_legacy_links.review_status
is '역할=검토 완료 여부; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_replacement_legacy_links.review_decision
is '역할=A to B, B to A, parallel, not replacement 판단; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_replacement_legacy_links.review_reason
is '역할=Legacy 검토 이유; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';

comment on table public.closet_replacement_legacy_link_revisions
is '역할=Legacy Link 판단의 append-only 변경 이력; source_of_truth=아님, 감사 이력; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_replacement_legacy_link_revisions.legacy_link_id
is '역할=변경 대상 Legacy Link; source_of_truth=revision history; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_replacement_legacy_link_revisions.revision_number
is '역할=Link별 변경 순서; source_of_truth=revision history; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_replacement_legacy_link_revisions.decision
is '역할=해당 revision의 판단; source_of_truth=revision history; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_replacement_legacy_link_revisions.reason
is '역할=해당 revision의 이유; source_of_truth=revision history; lifecycle=LEGACY_DROP_CANDIDATE';

comment on column public.closet_replacement_line_edges.source_kind
is '역할=manual 또는 legacy_link 출처 구분; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';

comment on column public.closet_replacement_line_edges.source_legacy_link_id
is '역할=Legacy 판단 출처 FK; source_of_truth=과도기 provenance; lifecycle=LEGACY_DROP_CANDIDATE';

comment on function public.review_closet_replacement_legacy_link(
  uuid,
  uuid,
  text,
  text
) is '역할=pending Legacy Link 최초 검토 wrapper; source_of_truth=closet_replacement_legacy_links; lifecycle=LEGACY_DROP_CANDIDATE';

comment on function public.revise_closet_replacement_legacy_link(
  uuid,
  uuid,
  timestamptz,
  text,
  text
) is '역할=Legacy 판단 수정과 revision 원자 추가; source_of_truth=legacy current snapshot과 revision history; lifecycle=LEGACY_DROP_CANDIDATE';

comment on function public.confirm_closet_replacement_line_edge(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text
) is '역할=Legacy 판단 하나를 confirmed edge로 전환; source_of_truth=closet_replacement_line_edges; lifecycle=LEGACY_DROP_CANDIDATE';

comment on function public.confirm_closet_replacement_line_edges(uuid, jsonb)
is '역할=Legacy edge 후보 batch 원자 확정; source_of_truth=closet_replacement_line_edges; lifecycle=LEGACY_DROP_CANDIDATE';

comment on function public.create_closet_replacement_manual_edge(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text
) is '역할=Legacy 출처 없는 manual edge 생성; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';

comment on function public.update_closet_replacement_line_edge_connection(
  uuid,
  uuid,
  timestamptz,
  uuid,
  text,
  text
) is '역할=edge predecessor와 설명 원자 수정; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE';

comment on function public.reverse_closet_replacement_line_edge(
  uuid,
  uuid,
  timestamptz
) is '역할=edge 방향 반전과 Legacy 판단 동기화; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE, Legacy dependency는 제거 후보';

commit;
