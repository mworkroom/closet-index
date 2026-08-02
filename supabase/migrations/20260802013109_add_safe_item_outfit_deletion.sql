create or replace function public.delete_closet_item_if_unreferenced(
  p_user_id uuid,
  p_workspace_id uuid,
  p_item_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_storage_paths text[];
begin
  if not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = p_workspace_id
      and member.user_id = p_user_id
  ) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  perform 1
  from public.closet_items item
  where item.workspace_id = p_workspace_id
    and item.id = p_item_id
  for update;

  if not found then
    raise exception 'Item을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.closet_outfit_items relation
    where relation.workspace_id = p_workspace_id
      and relation.item_id = p_item_id
  ) then
    raise exception '이 Item이 포함된 Outfit이 있어 삭제할 수 없습니다.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.closet_replacement_line_items relation
    where relation.workspace_id = p_workspace_id
      and relation.item_id = p_item_id
  ) then
    raise exception '교체 계보에 연결된 Item은 삭제할 수 없습니다.'
      using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct image.storage_path), array[]::text[])
  into v_storage_paths
  from public.closet_item_images image
  where image.workspace_id = p_workspace_id
    and image.item_id = p_item_id;

  delete from public.closet_items item
  where item.workspace_id = p_workspace_id
    and item.id = p_item_id;

  return v_storage_paths;
end;
$$;

create or replace function public.delete_closet_outfit_if_unworn(
  p_user_id uuid,
  p_workspace_id uuid,
  p_outfit_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_storage_paths text[];
begin
  if not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = p_workspace_id
      and member.user_id = p_user_id
  ) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  perform 1
  from public.closet_outfits outfit
  where outfit.workspace_id = p_workspace_id
    and outfit.id = p_outfit_id
  for update;

  if not found then
    raise exception 'Outfit을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.closet_wear_logs log
    where log.workspace_id = p_workspace_id
      and log.outfit_id = p_outfit_id
  ) then
    raise exception '착용 기록이 있는 Outfit은 삭제할 수 없습니다.'
      using errcode = 'P0001';
  end if;

  select coalesce(array_agg(distinct preview.storage_path), array[]::text[])
  into v_storage_paths
  from public.closet_outfit_previews preview
  where preview.workspace_id = p_workspace_id
    and preview.outfit_id = p_outfit_id;

  delete from public.closet_outfits outfit
  where outfit.workspace_id = p_workspace_id
    and outfit.id = p_outfit_id;

  return v_storage_paths;
end;
$$;

revoke all on function public.delete_closet_item_if_unreferenced(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function public.delete_closet_outfit_if_unworn(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.delete_closet_item_if_unreferenced(
  uuid,
  uuid,
  uuid
) to service_role;
grant execute on function public.delete_closet_outfit_if_unworn(
  uuid,
  uuid,
  uuid
) to service_role;
