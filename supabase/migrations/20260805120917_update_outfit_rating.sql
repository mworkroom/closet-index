update public.closet_outfits
set rating = 'ok'
where rating is null;

create or replace function private.normalize_closet_outfit_rating()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.rating := coalesce(new.rating, 'ok');
  return new;
end;
$$;

drop trigger if exists normalize_closet_outfit_rating
on public.closet_outfits;

create trigger normalize_closet_outfit_rating
before insert or update of rating on public.closet_outfits
for each row
execute function private.normalize_closet_outfit_rating();

alter table public.closet_outfits
  alter column rating set default 'ok',
  alter column rating set not null;

create function public.update_closet_outfit_with_rating(
  p_workspace_id uuid,
  p_outfit_id uuid,
  p_display_name text,
  p_rating text,
  p_items jsonb,
  p_allow_duplicate boolean default false
)
returns public.closet_outfits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outfit public.closet_outfits%rowtype;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_item_count integer;
  v_owned_item_count integer;
  v_has_duplicate boolean;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using errcode = '42501', message = 'workspace membership is required';
  end if;

  if p_rating is null or p_rating not in ('favorite', 'ok', 'error') then
    raise exception using errcode = '22023', message = 'a supported outfit rating is required';
  end if;

  if jsonb_typeof(v_items) <> 'array' then
    raise exception using errcode = '22023', message = 'outfit items must be a JSON array';
  end if;

  select count(*)::integer, count(distinct requested.item_id)::integer
  into v_item_count, v_owned_item_count
  from jsonb_to_recordset(v_items) as requested(
    item_id uuid, slot text, sort_order smallint, position_x numeric,
    position_y numeric, item_scale numeric, z_index smallint
  );

  if v_item_count = 0 or v_item_count <> v_owned_item_count then
    raise exception using errcode = '22023', message = 'outfit items must be non-empty and unique';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_items) as requested(
      item_id uuid, slot text, sort_order smallint, position_x numeric,
      position_y numeric, item_scale numeric, z_index smallint
    )
    where requested.sort_order is null
  ) then
    raise exception using errcode = '22023', message = 'every outfit item requires a sort order';
  end if;

  select count(*)::integer
  into v_owned_item_count
  from public.closet_items item
  join jsonb_to_recordset(v_items) as requested(
    item_id uuid, slot text, sort_order smallint, position_x numeric,
    position_y numeric, item_scale numeric, z_index smallint
  ) on requested.item_id = item.id
  where item.workspace_id = p_workspace_id;

  if v_owned_item_count <> v_item_count then
    raise exception using errcode = '42501', message = 'every outfit item must belong to the workspace';
  end if;

  select * into v_outfit
  from public.closet_outfits
  where workspace_id = p_workspace_id and id = p_outfit_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'outfit was not found';
  end if;

  if not p_allow_duplicate then
    select exists (
      select 1
      from public.closet_outfits outfit
      where outfit.workspace_id = p_workspace_id
        and outfit.id <> p_outfit_id
        and (
          select array_agg(relation.item_id order by relation.item_id)
          from public.closet_outfit_items relation
          where relation.workspace_id = outfit.workspace_id and relation.outfit_id = outfit.id
        ) = (
          select array_agg(requested.item_id order by requested.item_id)
          from jsonb_to_recordset(v_items) as requested(
            item_id uuid, slot text, sort_order smallint, position_x numeric,
            position_y numeric, item_scale numeric, z_index smallint
          )
        )
    ) into v_has_duplicate;

    if v_has_duplicate then
      raise exception using errcode = '23505', message = 'an outfit with the same item combination already exists';
    end if;
  end if;

  update public.closet_outfits
  set
    display_name = nullif(btrim(p_display_name), ''),
    rating = p_rating,
    updated_at = now()
  where workspace_id = p_workspace_id and id = p_outfit_id
  returning * into v_outfit;

  delete from public.closet_outfit_items
  where workspace_id = p_workspace_id and outfit_id = p_outfit_id;

  insert into public.closet_outfit_items (
    workspace_id, outfit_id, item_id, slot, sort_order,
    position_x, position_y, scale, z_index
  )
  select p_workspace_id, p_outfit_id, requested.item_id, requested.slot,
    requested.sort_order, requested.position_x, requested.position_y,
    requested.item_scale, requested.z_index
  from jsonb_to_recordset(v_items) as requested(
    item_id uuid, slot text, sort_order smallint, position_x numeric,
    position_y numeric, item_scale numeric, z_index smallint
  );

  return v_outfit;
end;
$$;

revoke all on function public.update_closet_outfit_with_rating(uuid, uuid, text, text, jsonb, boolean)
from public, anon, authenticated, service_role;

grant execute on function public.update_closet_outfit_with_rating(uuid, uuid, text, text, jsonb, boolean)
to authenticated, service_role;

comment on column public.closet_outfits.rating is
  'Outfit 평가. favorite, ok, error 중 하나이며 새 Outfit의 기본값은 ok; lifecycle=LIVE_CORE';
