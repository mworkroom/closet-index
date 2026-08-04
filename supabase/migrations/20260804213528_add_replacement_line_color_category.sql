alter table public.closet_replacement_lines
add column color_category text;

alter table public.closet_replacement_lines
add constraint closet_replacement_lines_color_category_length
check (
  color_category is null
  or (
    color_category = pg_catalog.btrim(color_category)
    and pg_catalog.char_length(color_category) between 1 and 40
  )
);

create or replace function public.set_closet_replacement_line_color_category(
  p_workspace_id uuid,
  p_line_id uuid,
  p_expected_updated_at timestamptz,
  p_color_category text
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
  normalized_category text := nullif(pg_catalog.btrim(p_color_category), '');
begin
  if actor_id is null
    or not private.is_workspace_member(p_workspace_id)
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if normalized_category is not null
    and pg_catalog.char_length(normalized_category) > 40
  then
    raise exception using
      errcode = '22001',
      message = 'replacement line color category is too long';
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

  update public.closet_replacement_lines line
  set color_category = normalized_category,
      updated_at = pg_catalog.clock_timestamp()
  where line.workspace_id = p_workspace_id
    and line.id = p_line_id
  returning line.* into saved_line;

  return saved_line;
end;
$$;

comment on function public.set_closet_replacement_line_color_category(
  uuid,
  uuid,
  timestamptz,
  text
) is 'Sets the human-selected color category for one replacement line with optimistic locking.';

revoke all on function public.set_closet_replacement_line_color_category(
  uuid,
  uuid,
  timestamptz,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.set_closet_replacement_line_color_category(
  uuid,
  uuid,
  timestamptz,
  text
) to authenticated;
