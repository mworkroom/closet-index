create or replace function public.create_closet_replacement_line(
  p_workspace_id uuid,
  p_name text,
  p_style_identity text,
  p_color_category text
)
returns public.closet_replacement_lines
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_name text := nullif(pg_catalog.btrim(p_name), '');
  normalized_style_identity text := nullif(pg_catalog.btrim(p_style_identity), '');
  normalized_color_category text := nullif(pg_catalog.btrim(p_color_category), '');
  created_line public.closet_replacement_lines;
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

  if normalized_color_category is null then
    raise exception using
      errcode = '22023',
      message = 'replacement line color category is required';
  end if;

  if pg_catalog.char_length(normalized_name) > 200
    or pg_catalog.char_length(normalized_style_identity) > 200
  then
    raise exception using
      errcode = '22001',
      message = 'replacement line name and style identity must be 200 characters or fewer';
  end if;

  if pg_catalog.char_length(normalized_color_category) > 40 then
    raise exception using
      errcode = '22001',
      message = 'replacement line color category must be 40 characters or fewer';
  end if;

  insert into public.closet_replacement_lines (
    workspace_id,
    name,
    style_identity,
    color_category,
    review_status,
    lifecycle_status,
    updated_at
  )
  values (
    p_workspace_id,
    normalized_name,
    normalized_style_identity,
    normalized_color_category,
    'ready',
    'active',
    pg_catalog.clock_timestamp()
  )
  returning * into created_line;

  return created_line;
end;
$$;

comment on function public.create_closet_replacement_line(
  uuid,
  text,
  text,
  text
) is 'Creates one active empty replacement line with human-selected metadata; the line table remains the source of truth.';

revoke all on function public.create_closet_replacement_line(
  uuid,
  text,
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.create_closet_replacement_line(
  uuid,
  text,
  text,
  text
) to authenticated;
