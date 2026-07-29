-- Phase 3 adds member-scoped Item writes and transactional Outfit creation
-- without granting direct INSERT/DELETE access to Outfit relations.

alter table public.closet_items
  add column display_hex text;

update public.closet_items item
set display_hex = coalesce(
  (
    select palette.display_hex
    from public.closet_color_palette palette
    where palette.id = item.palette_id
      and palette.workspace_id = item.workspace_id
  ),
  '#B8B8B4'
);

alter table public.closet_items
  alter column display_hex set not null,
  add constraint closet_items_display_hex_format
    check (display_hex ~ '^#[0-9A-Fa-f]{6}$');

alter table public.closet_outfits
  add column archived_at timestamptz;

alter table public.closet_outfit_previews
  add column stale_at timestamptz;

drop index public.closet_item_images_one_active_variant_idx;

create unique index closet_item_images_one_ready_variant_idx
  on public.closet_item_images (workspace_id, item_id, variant)
  where status = 'ready';

grant insert (
  id,
  workspace_id,
  name,
  category,
  semantic_color,
  palette_id,
  display_hex,
  seasons,
  rain_ok,
  long_walk_ok,
  memo,
  acquired_on
) on table public.closet_items to authenticated;

grant update (
  name,
  category,
  semantic_color,
  palette_id,
  display_hex,
  seasons,
  retired,
  rain_ok,
  long_walk_ok,
  memo,
  acquired_on,
  updated_at
) on table public.closet_items to authenticated;

grant update (
  display_name,
  rating,
  archived_at,
  updated_at
) on table public.closet_outfits to authenticated;

create policy closet_items_insert_member
on public.closet_items
for insert
to authenticated
with check (
  retired = false
  and notion_page_id is null
  and notion_created_at is null
  and (select private.is_workspace_member(workspace_id))
);

create policy closet_outfits_update_member
on public.closet_outfits
for update
to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create or replace function private.create_closet_outfit_record(
  p_workspace_id uuid,
  p_outfit_id uuid,
  p_display_name text,
  p_items jsonb,
  p_allow_duplicate boolean
)
returns public.closet_outfits
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_name text := nullif(trim(p_display_name), '');
  normalized_items jsonb;
  existing_items jsonb;
  existing_outfit public.closet_outfits%rowtype;
  item_count integer;
  distinct_item_count integer;
  owned_item_count integer;
  has_duplicate boolean;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if p_outfit_id is null then
    raise exception using
      errcode = '22023',
      message = 'outfit id is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'items must be a JSON array';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', item_id,
          'slot', slot,
          'sort_order', sort_order,
          'position_x', position_x,
          'position_y', position_y,
          'item_scale', item_scale,
          'z_index', z_index
        )
        order by item_id
      ),
      '[]'::jsonb
    ),
    count(*)::integer,
    count(distinct item_id)::integer
  into normalized_items, item_count, distinct_item_count
  from jsonb_to_recordset(p_items) as requested(
    item_id uuid,
    slot text,
    sort_order smallint,
    position_x numeric,
    position_y numeric,
    item_scale numeric,
    z_index smallint
  );

  if item_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'an outfit requires at least one item';
  end if;

  if item_count <> distinct_item_count then
    raise exception using
      errcode = '22023',
      message = 'outfit items must be unique and non-null';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(normalized_items) as requested(
      item_id uuid,
      slot text,
      sort_order smallint,
      position_x numeric,
      position_y numeric,
      item_scale numeric,
      z_index smallint
    )
    where sort_order is null
  ) then
    raise exception using
      errcode = '22023',
      message = 'every outfit item requires a sort order';
  end if;

  select count(*)::integer
  into owned_item_count
  from public.closet_items item
  join jsonb_to_recordset(normalized_items) as requested(
    item_id uuid,
    slot text,
    sort_order smallint,
    position_x numeric,
    position_y numeric,
    item_scale numeric,
    z_index smallint
  ) on requested.item_id = item.id
  where item.workspace_id = p_workspace_id;

  if owned_item_count <> item_count then
    raise exception using
      errcode = '42501',
      message = 'every outfit item must belong to the workspace';
  end if;

  select *
  into existing_outfit
  from public.closet_outfits
  where id = p_outfit_id;

  if found then
    if existing_outfit.workspace_id <> p_workspace_id then
      raise exception using
        errcode = '42501',
        message = 'outfit id belongs to another workspace';
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', relation.item_id,
          'slot', relation.slot,
          'sort_order', relation.sort_order,
          'position_x', relation.position_x,
          'position_y', relation.position_y,
          'item_scale', relation.scale,
          'z_index', relation.z_index
        )
        order by relation.item_id
      ),
      '[]'::jsonb
    )
    into existing_items
    from public.closet_outfit_items relation
    where relation.workspace_id = p_workspace_id
      and relation.outfit_id = p_outfit_id;

    if existing_outfit.display_name is distinct from normalized_name
      or existing_items is distinct from normalized_items
    then
      raise exception using
        errcode = '23505',
        message = 'outfit id was already used with different content';
    end if;

    return existing_outfit;
  end if;

  if not p_allow_duplicate then
    select exists (
      select 1
      from public.closet_outfits outfit
      where outfit.workspace_id = p_workspace_id
        and (
          select array_agg(relation.item_id order by relation.item_id)
          from public.closet_outfit_items relation
          where relation.workspace_id = outfit.workspace_id
            and relation.outfit_id = outfit.id
        ) = (
          select array_agg(requested.item_id order by requested.item_id)
          from jsonb_to_recordset(normalized_items) as requested(
            item_id uuid,
            slot text,
            sort_order smallint,
            position_x numeric,
            position_y numeric,
            item_scale numeric,
            z_index smallint
          )
        )
    )
    into has_duplicate;

    if has_duplicate then
      raise exception using
        errcode = '23505',
        message = 'an outfit with the same item combination already exists';
    end if;
  end if;

  insert into public.closet_outfits (
    id,
    workspace_id,
    display_name,
    rating,
    archived_at
  )
  values (
    p_outfit_id,
    p_workspace_id,
    normalized_name,
    null,
    null
  )
  returning * into existing_outfit;

  insert into public.closet_outfit_items (
    workspace_id,
    outfit_id,
    item_id,
    slot,
    sort_order,
    position_x,
    position_y,
    scale,
    z_index
  )
  select
    p_workspace_id,
    p_outfit_id,
    requested.item_id,
    requested.slot,
    requested.sort_order,
    requested.position_x,
    requested.position_y,
    requested.item_scale,
    requested.z_index
  from jsonb_to_recordset(normalized_items) as requested(
    item_id uuid,
    slot text,
    sort_order smallint,
    position_x numeric,
    position_y numeric,
    item_scale numeric,
    z_index smallint
  );

  return existing_outfit;
end;
$$;

create or replace function public.create_closet_outfit(
  p_workspace_id uuid,
  p_outfit_id uuid,
  p_display_name text,
  p_items jsonb,
  p_allow_duplicate boolean default false
)
returns public.closet_outfits
language sql
security definer
set search_path = ''
as $$
  select private.create_closet_outfit_record(
    p_workspace_id,
    p_outfit_id,
    p_display_name,
    p_items,
    p_allow_duplicate
  );
$$;

create or replace function public.clone_closet_outfit(
  p_workspace_id uuid,
  p_source_outfit_id uuid,
  p_outfit_id uuid,
  p_display_name text default null
)
returns public.closet_outfits
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_outfit public.closet_outfits%rowtype;
  source_items jsonb;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  select *
  into source_outfit
  from public.closet_outfits
  where workspace_id = p_workspace_id
    and id = p_source_outfit_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'source outfit was not found';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'item_id', relation.item_id,
      'slot', relation.slot,
      'sort_order', relation.sort_order,
      'position_x', relation.position_x,
      'position_y', relation.position_y,
      'item_scale', relation.scale,
      'z_index', relation.z_index
    )
    order by relation.sort_order, relation.item_id
  )
  into source_items
  from public.closet_outfit_items relation
  where relation.workspace_id = p_workspace_id
    and relation.outfit_id = p_source_outfit_id;

  return private.create_closet_outfit_record(
    p_workspace_id,
    p_outfit_id,
    coalesce(p_display_name, source_outfit.display_name),
    source_items,
    true
  );
end;
$$;

create or replace function public.find_matching_closet_outfits(
  p_workspace_id uuid,
  p_item_ids uuid[]
)
returns table (
  id uuid,
  display_name text,
  rating text,
  archived_at timestamptz
)
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

  if coalesce(cardinality(p_item_ids), 0) = 0
    or cardinality(p_item_ids) <> (
      select count(distinct requested.item_id)
      from unnest(p_item_ids) as requested(item_id)
    )
  then
    raise exception using
      errcode = '22023',
      message = 'item ids must be non-empty and unique';
  end if;

  return query
  select
    outfit.id,
    outfit.display_name,
    outfit.rating,
    outfit.archived_at
  from public.closet_outfits outfit
  where outfit.workspace_id = p_workspace_id
    and (
      select array_agg(relation.item_id order by relation.item_id)
      from public.closet_outfit_items relation
      where relation.workspace_id = outfit.workspace_id
        and relation.outfit_id = outfit.id
    ) = (
      select array_agg(requested.item_id order by requested.item_id)
      from unnest(p_item_ids) as requested(item_id)
    )
  order by outfit.created_at, outfit.id;
end;
$$;

revoke all on function private.create_closet_outfit_record(
  uuid,
  uuid,
  text,
  jsonb,
  boolean
) from public, anon, authenticated;

revoke all on function public.create_closet_outfit(
  uuid,
  uuid,
  text,
  jsonb,
  boolean
) from public, anon;

revoke all on function public.clone_closet_outfit(
  uuid,
  uuid,
  uuid,
  text
) from public, anon;

revoke all on function public.find_matching_closet_outfits(
  uuid,
  uuid[]
) from public, anon;

grant execute on function public.create_closet_outfit(
  uuid,
  uuid,
  text,
  jsonb,
  boolean
) to authenticated;

grant execute on function public.clone_closet_outfit(
  uuid,
  uuid,
  uuid,
  text
) to authenticated;

grant execute on function public.find_matching_closet_outfits(
  uuid,
  uuid[]
) to authenticated;
