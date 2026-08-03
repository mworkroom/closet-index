create table public.closet_replacement_legacy_link_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  legacy_link_id uuid not null,
  revision_number integer not null,
  decision text not null,
  reason text not null,
  reviewed_at timestamptz not null,
  reviewed_by uuid not null references auth.users (id) on delete restrict,
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
from public, anon, authenticated;

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
select
  link.workspace_id,
  link.id,
  1,
  link.review_decision,
  link.review_reason,
  link.reviewed_at,
  link.reviewed_by,
  link.reviewed_at
from public.closet_replacement_legacy_links link
where link.review_status = 'reviewed';

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
) from public, anon, authenticated;

grant execute on function public.revise_closet_replacement_legacy_link(
  uuid,
  uuid,
  timestamptz,
  text,
  text
) to authenticated;

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
) from public, anon, authenticated;

grant execute on function public.review_closet_replacement_legacy_link(
  uuid,
  uuid,
  text,
  text
) to authenticated;
