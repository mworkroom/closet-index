alter table public.closet_replacement_lines
  add column review_status text not null default 'ready',
  add column updated_at timestamptz not null default now();

alter table public.closet_replacement_lines
  add constraint closet_replacement_lines_review_status_check
  check (review_status in ('ready', 'needs_review'));

create index closet_replacement_lines_needs_review_idx
  on public.closet_replacement_lines (workspace_id, updated_at desc)
  where review_status = 'needs_review';

create or replace function public.move_closet_replacement_line_item(
  p_workspace_id uuid,
  p_source_line_id uuid,
  p_item_id uuid,
  p_target_line_id uuid,
  p_new_line_name text,
  p_new_line_style_identity text,
  p_expected_source_updated_at timestamptz,
  p_expected_target_updated_at timestamptz
)
returns public.closet_replacement_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_line public.closet_replacement_lines;
  target_line public.closet_replacement_lines;
  resolved_target_line_id uuid;
  normalized_name text := nullif(trim(p_new_line_name), '');
  normalized_style_identity text := nullif(trim(p_new_line_style_identity), '');
  changed_at timestamptz := clock_timestamp();
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if p_source_line_id is null or p_item_id is null then
    raise exception using
      errcode = '22023',
      message = 'source line and item are required';
  end if;

  if p_expected_source_updated_at is null then
    raise exception using
      errcode = '22023',
      message = 'the expected source line timestamp is required';
  end if;

  if p_target_line_id is null then
    if normalized_name is null then
      raise exception using
        errcode = '22023',
        message = 'a new line name is required';
    end if;

    if p_expected_target_updated_at is not null then
      raise exception using
        errcode = '22023',
        message = 'a new line cannot have an expected target timestamp';
    end if;
  else
    if p_target_line_id = p_source_line_id then
      raise exception using
        errcode = '22023',
        message = 'the target line must differ from the source line';
    end if;

    if normalized_name is not null or normalized_style_identity is not null then
      raise exception using
        errcode = '22023',
        message = 'new line fields cannot be used with an existing target line';
    end if;

    if p_expected_target_updated_at is null then
      raise exception using
        errcode = '22023',
        message = 'the expected target line timestamp is required';
    end if;
  end if;

  if normalized_name is not null and char_length(normalized_name) > 200 then
    raise exception using
      errcode = '22023',
      message = 'the replacement line name is too long';
  end if;

  if normalized_style_identity is not null
    and char_length(normalized_style_identity) > 200
  then
    raise exception using
      errcode = '22023',
      message = 'the style identity is too long';
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

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'the source replacement line was not found';
  end if;

  if source_line.updated_at <> p_expected_source_updated_at then
    raise exception using
      errcode = '40001',
      message = 'the source replacement line changed; reload before moving the item';
  end if;

  if p_target_line_id is null then
    insert into public.closet_replacement_lines (
      workspace_id,
      name,
      style_identity,
      review_status,
      updated_at
    )
    values (
      p_workspace_id,
      normalized_name,
      normalized_style_identity,
      'needs_review',
      changed_at
    )
    returning * into target_line;
    resolved_target_line_id := target_line.id;
  else
    select line.*
    into target_line
    from public.closet_replacement_lines line
    where line.workspace_id = p_workspace_id
      and line.id = p_target_line_id;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'the target replacement line was not found';
    end if;

    if target_line.updated_at <> p_expected_target_updated_at then
      raise exception using
        errcode = '40001',
        message = 'the target replacement line changed; reload before moving the item';
    end if;
    resolved_target_line_id := target_line.id;
  end if;

  perform 1
  from public.closet_replacement_line_items membership
  where membership.workspace_id = p_workspace_id
    and membership.replacement_line_id = p_source_line_id
    and membership.item_id = p_item_id
  for update;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'the item does not belong to the source replacement line';
  end if;

  if exists (
    select 1
    from public.closet_replacement_line_items membership
    where membership.workspace_id = p_workspace_id
      and membership.replacement_line_id = resolved_target_line_id
      and membership.item_id = p_item_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'the item already belongs to the target replacement line';
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
      message = 'disconnect all lineage edges before moving the item';
  end if;

  delete from public.closet_replacement_line_starts start
  where start.workspace_id = p_workspace_id
    and start.replacement_line_id = p_source_line_id
    and start.item_id = p_item_id;

  delete from public.closet_replacement_line_items membership
  where membership.workspace_id = p_workspace_id
    and membership.replacement_line_id = p_source_line_id
    and membership.item_id = p_item_id;

  insert into public.closet_replacement_line_items (
    workspace_id,
    replacement_line_id,
    item_id
  )
  values (
    p_workspace_id,
    resolved_target_line_id,
    p_item_id
  );

  insert into public.closet_replacement_line_starts (
    workspace_id,
    replacement_line_id,
    item_id,
    designated_by
  )
  values (
    p_workspace_id,
    resolved_target_line_id,
    p_item_id,
    (select auth.uid())
  );

  update public.closet_replacement_lines line
  set review_status = 'needs_review',
      updated_at = changed_at
  where line.workspace_id = p_workspace_id
    and line.id in (p_source_line_id, resolved_target_line_id);

  select line.*
  into target_line
  from public.closet_replacement_lines line
  where line.workspace_id = p_workspace_id
    and line.id = resolved_target_line_id;

  return target_line;
end;
$$;

comment on function public.move_closet_replacement_line_item(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz
) is 'Moves an edge-free item between replacement lines, optionally creating the target line, and marks both lines for review.';

revoke all on function public.move_closet_replacement_line_item(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.move_closet_replacement_line_item(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  timestamptz
) to authenticated;
