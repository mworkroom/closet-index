create table public.closet_replacement_legacy_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  item_a_id uuid not null,
  item_b_id uuid not null,
  source text not null default 'notion_replaces',
  source_item_a_notion_page_id uuid not null,
  source_item_b_notion_page_id uuid not null,
  review_status text not null default 'pending',
  review_decision text,
  review_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete restrict,
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

revoke all on table public.closet_replacement_legacy_links
from public, anon, authenticated;

grant select on table public.closet_replacement_legacy_links
to authenticated;

grant select, insert on table public.closet_replacement_legacy_links
to service_role;

alter table public.closet_replacement_legacy_links enable row level security;

create policy closet_replacement_legacy_links_select_member
on public.closet_replacement_legacy_links
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

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
  reviewed_link public.closet_replacement_legacy_links;
  normalized_reason text := trim(p_reason);
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

  update public.closet_replacement_legacy_links link
  set
    review_status = 'reviewed',
    review_decision = p_decision,
    review_reason = normalized_reason,
    reviewed_at = now(),
    reviewed_by = (select auth.uid()),
    updated_at = now()
  where link.id = p_link_id
    and link.workspace_id = p_workspace_id
    and link.review_status = 'pending'
  returning * into reviewed_link;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'pending legacy link was not found';
  end if;

  return reviewed_link;
end;
$$;

revoke all on function public.review_closet_replacement_legacy_link(
  uuid,
  uuid,
  text,
  text
) from public, anon;

grant execute on function public.review_closet_replacement_legacy_link(
  uuid,
  uuid,
  text,
  text
) to authenticated;
