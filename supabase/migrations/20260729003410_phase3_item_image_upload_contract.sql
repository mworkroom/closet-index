-- Phase 3 keeps authenticated clients away from direct Storage writes.
-- The Edge Function calls these service-role-only functions after checking
-- workspace membership with the caller-scoped client.

create or replace function public.begin_closet_item_image_upload(
  p_workspace_id uuid,
  p_item_id uuid,
  p_image_id uuid,
  p_width_px integer,
  p_height_px integer,
  p_bytes integer
)
returns table (
  image_id uuid,
  storage_path text,
  abandoned_storage_paths text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_storage_path text;
  v_abandoned_paths text[];
begin
  if p_width_px < 1 or p_width_px > 4096
    or p_height_px < 1 or p_height_px > 4096
  then
    raise exception 'invalid image dimensions'
      using errcode = '22023';
  end if;

  if p_bytes < 1 or p_bytes > 716800 then
    raise exception 'invalid image byte size'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.closet_items item
    where item.workspace_id = p_workspace_id
      and item.id = p_item_id
  ) then
    raise exception 'item not found'
      using errcode = 'P0002';
  end if;

  select coalesce(array_agg(image.storage_path), array[]::text[])
  into v_abandoned_paths
  from public.closet_item_images image
  where image.workspace_id = p_workspace_id
    and image.item_id = p_item_id
    and image.variant = 'cutout'
    and image.status = 'pending';

  update public.closet_item_images
  set
    status = 'error',
    updated_at = now()
  where workspace_id = p_workspace_id
    and item_id = p_item_id
    and variant = 'cutout'
    and status = 'pending';

  v_storage_path :=
    p_workspace_id::text
    || '/items/'
    || p_item_id::text
    || '/cutout/'
    || p_image_id::text
    || '.webp';

  insert into public.closet_item_images (
    id,
    workspace_id,
    item_id,
    storage_path,
    variant,
    status,
    width_px,
    height_px
  )
  values (
    p_image_id,
    p_workspace_id,
    p_item_id,
    v_storage_path,
    'cutout',
    'pending',
    p_width_px,
    p_height_px
  );

  return query
  select p_image_id, v_storage_path, v_abandoned_paths;
end;
$$;

create or replace function public.finalize_closet_item_image_upload(
  p_workspace_id uuid,
  p_item_id uuid,
  p_image_id uuid
)
returns table (
  image_id uuid,
  storage_path text,
  width_px integer,
  height_px integer,
  replaced_storage_paths text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending public.closet_item_images%rowtype;
  v_replaced_paths text[];
  v_object_size bigint;
  v_object_type text;
begin
  select image.*
  into v_pending
  from public.closet_item_images image
  where image.workspace_id = p_workspace_id
    and image.item_id = p_item_id
    and image.id = p_image_id
    and image.variant = 'cutout'
    and image.status = 'pending'
  for update;

  if not found then
    raise exception 'pending image not found'
      using errcode = 'P0002';
  end if;

  select
    nullif(object.metadata ->> 'size', '')::bigint,
    lower(object.metadata ->> 'mimetype')
  into v_object_size, v_object_type
  from storage.objects object
  where object.bucket_id = 'closet-images'
    and object.name = v_pending.storage_path;

  if v_object_size is null then
    raise exception 'uploaded object not found'
      using errcode = 'P0002';
  end if;

  if v_object_size < 1 or v_object_size > 716800 then
    raise exception 'uploaded object exceeds byte limit'
      using errcode = '22023';
  end if;

  if v_object_type is distinct from 'image/webp' then
    raise exception 'uploaded object must be image/webp'
      using errcode = '22023';
  end if;

  select coalesce(array_agg(image.storage_path), array[]::text[])
  into v_replaced_paths
  from public.closet_item_images image
  where image.workspace_id = p_workspace_id
    and image.item_id = p_item_id
    and image.variant = 'cutout'
    and image.status = 'ready'
    and image.id <> p_image_id;

  update public.closet_item_images
  set
    status = 'error',
    updated_at = now()
  where workspace_id = p_workspace_id
    and item_id = p_item_id
    and variant = 'cutout'
    and status = 'ready'
    and id <> p_image_id;

  update public.closet_item_images
  set
    status = 'ready',
    updated_at = now()
  where id = p_image_id;

  return query
  select
    v_pending.id,
    v_pending.storage_path,
    v_pending.width_px,
    v_pending.height_px,
    v_replaced_paths;
end;
$$;

create or replace function public.cancel_closet_item_image_upload(
  p_workspace_id uuid,
  p_item_id uuid,
  p_image_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_storage_path text;
begin
  update public.closet_item_images
  set
    status = 'error',
    updated_at = now()
  where workspace_id = p_workspace_id
    and item_id = p_item_id
    and id = p_image_id
    and variant = 'cutout'
    and status = 'pending'
  returning storage_path into v_storage_path;

  return v_storage_path;
end;
$$;

revoke all on function public.begin_closet_item_image_upload(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  integer
) from public, anon, authenticated;
revoke all on function public.finalize_closet_item_image_upload(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;
revoke all on function public.cancel_closet_item_image_upload(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.begin_closet_item_image_upload(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  integer
) to service_role;
grant execute on function public.finalize_closet_item_image_upload(
  uuid,
  uuid,
  uuid
) to service_role;
grant execute on function public.cancel_closet_item_image_upload(
  uuid,
  uuid,
  uuid
) to service_role;
