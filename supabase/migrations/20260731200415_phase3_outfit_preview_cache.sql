-- Phase 3 P3-6 adds a versioned Outfit preview upload lifecycle. Browser
-- composition stays the source of truth; these rows are replaceable caches.

alter table public.closet_outfit_previews
  add column source_fingerprint text,
  add constraint closet_outfit_previews_source_fingerprint_format check (
    source_fingerprint is null
    or source_fingerprint ~ '^[0-9a-f]{64}$'
  );

drop policy closet_outfit_previews_select_ready_member
on public.closet_outfit_previews;

create policy closet_outfit_previews_select_member
on public.closet_outfit_previews
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create or replace function private.mark_outfit_preview_stale_from_relation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid := coalesce(new.workspace_id, old.workspace_id);
  v_outfit_id uuid := coalesce(new.outfit_id, old.outfit_id);
begin
  update public.closet_outfit_previews preview
  set
    stale_at = coalesce(preview.stale_at, now()),
    updated_at = now()
  where preview.workspace_id = v_workspace_id
    and preview.outfit_id = v_outfit_id
    and preview.status = 'ready';
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.mark_outfit_preview_stale_from_relation()
from public, anon, authenticated;

create trigger closet_outfit_items_mark_preview_stale
after insert or update or delete
on public.closet_outfit_items
for each row
execute function private.mark_outfit_preview_stale_from_relation();

create or replace function private.mark_outfit_preview_stale_from_item_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.variant = 'cutout'
    and new.status = 'ready'
    and old.status is distinct from 'ready'
  then
    update public.closet_outfit_previews preview
    set
      stale_at = coalesce(preview.stale_at, now()),
      updated_at = now()
    where preview.workspace_id = new.workspace_id
      and preview.status = 'ready'
      and exists (
        select 1
        from public.closet_outfit_items relation
        where relation.workspace_id = preview.workspace_id
          and relation.outfit_id = preview.outfit_id
          and relation.item_id = new.item_id
      );
  end if;
  return new;
end;
$$;

revoke all on function private.mark_outfit_preview_stale_from_item_image()
from public, anon, authenticated;

create trigger closet_item_images_mark_preview_stale
after update of status
on public.closet_item_images
for each row
execute function private.mark_outfit_preview_stale_from_item_image();

create or replace function public.begin_closet_outfit_preview_upload(
  p_workspace_id uuid,
  p_outfit_id uuid,
  p_preview_id uuid,
  p_width_px integer,
  p_height_px integer,
  p_bytes integer,
  p_source_fingerprint text
)
returns table (
  preview_id uuid,
  storage_path text,
  composition_version integer,
  abandoned_storage_paths text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_storage_path text;
  v_version integer;
  v_abandoned_paths text[];
begin
  if p_width_px <> 900 or p_height_px <> 1200 then
    raise exception 'preview dimensions must be 900x1200'
      using errcode = '22023';
  end if;
  if p_bytes < 1 or p_bytes > 716800 then
    raise exception 'invalid preview byte size'
      using errcode = '22023';
  end if;
  if p_source_fingerprint is null
    or p_source_fingerprint !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid preview source fingerprint'
      using errcode = '22023';
  end if;

  perform 1
  from public.closet_outfits outfit
  where outfit.workspace_id = p_workspace_id
    and outfit.id = p_outfit_id
  for update;
  if not found then
    raise exception 'outfit not found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(preview.storage_path), array[]::text[])
  into v_abandoned_paths
  from public.closet_outfit_previews preview
  where preview.workspace_id = p_workspace_id
    and preview.outfit_id = p_outfit_id
    and preview.status = 'pending';

  update public.closet_outfit_previews
  set status = 'error', updated_at = now()
  where workspace_id = p_workspace_id
    and outfit_id = p_outfit_id
    and status = 'pending';

  select coalesce(max(preview.composition_version), 0) + 1
  into v_version
  from public.closet_outfit_previews preview
  where preview.workspace_id = p_workspace_id
    and preview.outfit_id = p_outfit_id;

  v_storage_path :=
    p_workspace_id::text
    || '/outfits/'
    || p_outfit_id::text
    || '/preview/v'
    || v_version::text
    || '.webp';

  insert into public.closet_outfit_previews (
    id,
    workspace_id,
    outfit_id,
    storage_path,
    status,
    composition_version,
    width_px,
    height_px,
    source_fingerprint,
    stale_at
  ) values (
    p_preview_id,
    p_workspace_id,
    p_outfit_id,
    v_storage_path,
    'pending',
    v_version,
    p_width_px,
    p_height_px,
    p_source_fingerprint,
    null
  );

  return query
  select p_preview_id, v_storage_path, v_version, v_abandoned_paths;
end;
$$;

create or replace function public.finalize_closet_outfit_preview_upload(
  p_workspace_id uuid,
  p_outfit_id uuid,
  p_preview_id uuid
)
returns table (
  preview_id uuid,
  storage_path text,
  composition_version integer,
  source_fingerprint text,
  replaced_storage_paths text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending public.closet_outfit_previews%rowtype;
  v_replaced_paths text[];
  v_object_size bigint;
  v_object_type text;
begin
  select preview.*
  into v_pending
  from public.closet_outfit_previews preview
  where preview.workspace_id = p_workspace_id
    and preview.outfit_id = p_outfit_id
    and preview.id = p_preview_id
    and preview.status = 'pending'
  for update;
  if not found then
    raise exception 'pending preview not found' using errcode = 'P0002';
  end if;

  select
    nullif(object.metadata ->> 'size', '')::bigint,
    lower(object.metadata ->> 'mimetype')
  into v_object_size, v_object_type
  from storage.objects object
  where object.bucket_id = 'closet-images'
    and object.name = v_pending.storage_path;

  if v_object_size is null then
    raise exception 'uploaded preview object not found' using errcode = 'P0002';
  end if;
  if v_object_size < 1 or v_object_size > 716800 then
    raise exception 'uploaded preview exceeds byte limit' using errcode = '22023';
  end if;
  if v_object_type is distinct from 'image/webp' then
    raise exception 'uploaded preview must be image/webp' using errcode = '22023';
  end if;

  select coalesce(array_agg(preview.storage_path), array[]::text[])
  into v_replaced_paths
  from public.closet_outfit_previews preview
  where preview.workspace_id = p_workspace_id
    and preview.outfit_id = p_outfit_id
    and preview.status = 'ready'
    and preview.id <> p_preview_id;

  update public.closet_outfit_previews
  set status = 'error', stale_at = coalesce(stale_at, now()), updated_at = now()
  where workspace_id = p_workspace_id
    and outfit_id = p_outfit_id
    and status = 'ready'
    and id <> p_preview_id;

  update public.closet_outfit_previews
  set status = 'ready', stale_at = null, updated_at = now()
  where id = p_preview_id;

  return query
  select
    v_pending.id,
    v_pending.storage_path,
    v_pending.composition_version,
    v_pending.source_fingerprint,
    v_replaced_paths;
end;
$$;

create or replace function public.cancel_closet_outfit_preview_upload(
  p_workspace_id uuid,
  p_outfit_id uuid,
  p_preview_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_storage_path text;
begin
  update public.closet_outfit_previews
  set status = 'error', updated_at = now()
  where workspace_id = p_workspace_id
    and outfit_id = p_outfit_id
    and id = p_preview_id
    and status = 'pending'
  returning storage_path into v_storage_path;
  return v_storage_path;
end;
$$;

revoke all on function public.begin_closet_outfit_preview_upload(
  uuid, uuid, uuid, integer, integer, integer, text
) from public, anon, authenticated;
revoke all on function public.finalize_closet_outfit_preview_upload(
  uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.cancel_closet_outfit_preview_upload(
  uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.begin_closet_outfit_preview_upload(
  uuid, uuid, uuid, integer, integer, integer, text
) to service_role;
grant execute on function public.finalize_closet_outfit_preview_upload(
  uuid, uuid, uuid
) to service_role;
grant execute on function public.cancel_closet_outfit_preview_upload(
  uuid, uuid, uuid
) to service_role;
