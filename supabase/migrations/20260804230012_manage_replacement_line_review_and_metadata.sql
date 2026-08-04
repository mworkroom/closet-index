create or replace function public.acknowledge_closet_replacement_line_review(
  p_workspace_id uuid,
  p_line_id uuid,
  p_expected_updated_at timestamptz
)
returns public.closet_replacement_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
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

  if current_line.lifecycle_status <> 'active' then
    raise exception using
      errcode = '23514',
      message = 'only active replacement lines can complete review';
  end if;

  if exists (
    select 1
    from public.closet_replacement_line_edges edge
    where edge.workspace_id = p_workspace_id
      and edge.replacement_line_id = p_line_id
      and edge.status = 'needs_review'
  ) then
    raise exception using
      errcode = '23514',
      message = 'review each pending lineage edge before completing line review';
  end if;

  update public.closet_replacement_lines line
  set review_status = 'ready',
      updated_at = pg_catalog.clock_timestamp()
  where line.workspace_id = p_workspace_id
    and line.id = p_line_id
  returning line.* into saved_line;

  return saved_line;
end;
$$;

comment on function public.acknowledge_closet_replacement_line_review(
  uuid,
  uuid,
  timestamptz
) is 'Marks an active replacement line membership review complete after pending edges are resolved.';

revoke all on function public.acknowledge_closet_replacement_line_review(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.acknowledge_closet_replacement_line_review(
  uuid,
  uuid,
  timestamptz
) to authenticated;

create or replace function public.update_closet_replacement_line_details(
  p_workspace_id uuid,
  p_line_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_style_identity text
)
returns public.closet_replacement_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_line public.closet_replacement_lines;
  saved_line public.closet_replacement_lines;
  normalized_name text := nullif(pg_catalog.btrim(p_name), '');
  normalized_style_identity text := nullif(pg_catalog.btrim(p_style_identity), '');
begin
  if actor_id is null
    or not private.is_workspace_member(p_workspace_id)
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if normalized_name is null then
    raise exception using
      errcode = '22023',
      message = 'replacement line name is required';
  end if;

  if pg_catalog.char_length(normalized_name) > 200
    or pg_catalog.char_length(normalized_style_identity) > 200
  then
    raise exception using
      errcode = '22001',
      message = 'replacement line name and style identity must be 200 characters or fewer';
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

  if current_line.lifecycle_status <> 'active' then
    raise exception using
      errcode = '23514',
      message = 'archived replacement line details are read-only';
  end if;

  update public.closet_replacement_lines line
  set name = normalized_name,
      style_identity = normalized_style_identity,
      updated_at = pg_catalog.clock_timestamp()
  where line.workspace_id = p_workspace_id
    and line.id = p_line_id
  returning line.* into saved_line;

  return saved_line;
end;
$$;

comment on function public.update_closet_replacement_line_details(
  uuid,
  uuid,
  timestamptz,
  text,
  text
) is 'Updates the editable name and optional style identity of one active replacement line.';

revoke all on function public.update_closet_replacement_line_details(
  uuid,
  uuid,
  timestamptz,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.update_closet_replacement_line_details(
  uuid,
  uuid,
  timestamptz,
  text,
  text
) to authenticated;

create or replace function public.delete_empty_closet_replacement_line(
  p_workspace_id uuid,
  p_line_id uuid,
  p_expected_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  current_line public.closet_replacement_lines;
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
      message = 'replacement line changed; reload before deleting';
  end if;

  if current_line.lifecycle_status <> 'active'
    or current_line.representative_line_id is not null
  then
    raise exception using
      errcode = '23514',
      message = 'only active standalone replacement lines can be deleted';
  end if;

  if exists (
    select 1
    from public.closet_replacement_line_items membership
    where membership.workspace_id = p_workspace_id
      and membership.replacement_line_id = p_line_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'replacement line still has item memberships';
  end if;

  if exists (
    select 1
    from public.closet_replacement_line_edges edge
    where edge.workspace_id = p_workspace_id
      and edge.replacement_line_id = p_line_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'replacement line still has lineage edges';
  end if;

  if exists (
    select 1
    from public.closet_replacement_line_starts start
    where start.workspace_id = p_workspace_id
      and start.replacement_line_id = p_line_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'replacement line still has designated starts';
  end if;

  if exists (
    select 1
    from public.closet_replacement_lines merged_line
    where merged_line.workspace_id = p_workspace_id
      and merged_line.representative_line_id = p_line_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'replacement line is referenced as a representative line';
  end if;

  delete from public.closet_replacement_lines line
  where line.workspace_id = p_workspace_id
    and line.id = p_line_id;

  return true;
end;
$$;

comment on function public.delete_empty_closet_replacement_line(
  uuid,
  uuid,
  timestamptz
) is 'Deletes an active standalone replacement line only after every membership and lineage dependency is empty.';

revoke all on function public.delete_empty_closet_replacement_line(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.delete_empty_closet_replacement_line(
  uuid,
  uuid,
  timestamptz
) to authenticated;
