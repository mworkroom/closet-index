-- Phase 3 production rollback.
--
-- Run only when:
-- 1. closet-item-image has been disabled or removed first.
-- 2. No Phase 3 Item, Outfit, preview, or image write has happened.
-- 3. The production baseline still matches the 2026-07-29 preflight.
--
-- The guards deliberately stop instead of deleting or guessing through
-- unexpected production changes.

begin;

lock table
  public.closet_items,
  public.closet_outfits,
  public.closet_outfit_items,
  public.closet_item_images,
  public.closet_outfit_previews
in share row exclusive mode;

do $$
declare
  v_items integer;
  v_outfits integer;
  v_relations integer;
  v_images integer;
  v_storage_objects integer;
begin
  select count(*)::integer into v_items
  from public.closet_items;

  select count(*)::integer into v_outfits
  from public.closet_outfits;

  select count(*)::integer into v_relations
  from public.closet_outfit_items;

  select count(*)::integer into v_images
  from public.closet_item_images;

  select count(*)::integer into v_storage_objects
  from storage.objects
  where bucket_id = 'closet-images';

  if v_items <> 451
    or v_outfits <> 507
    or v_relations <> 2401
    or v_images <> 56
    or v_storage_objects <> 57
  then
    raise exception using
      errcode = '55000',
      message = format(
        'Phase 3 rollback stopped: baseline changed (items=%s outfits=%s relations=%s images=%s storage=%s)',
        v_items,
        v_outfits,
        v_relations,
        v_images,
        v_storage_objects
      );
  end if;

  if exists (
    select 1
    from public.closet_item_images
    where status <> 'ready'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Phase 3 rollback stopped: pending or error image metadata exists';
  end if;

  if exists (
    select 1
    from public.closet_outfits
    where archived_at is not null
  ) then
    raise exception using
      errcode = '55000',
      message = 'Phase 3 rollback stopped: archived outfits exist';
  end if;

  if exists (
    select 1
    from public.closet_outfit_previews
    where stale_at is not null
  ) then
    raise exception using
      errcode = '55000',
      message = 'Phase 3 rollback stopped: stale outfit previews exist';
  end if;
end;
$$;

drop function if exists public.cancel_closet_item_image_upload(
  uuid,
  uuid,
  uuid
);
drop function if exists public.finalize_closet_item_image_upload(
  uuid,
  uuid,
  uuid
);
drop function if exists public.begin_closet_item_image_upload(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  integer
);

drop function if exists public.find_matching_closet_outfits(
  uuid,
  uuid[]
);
drop function if exists public.clone_closet_outfit(
  uuid,
  uuid,
  uuid,
  text
);
drop function if exists public.create_closet_outfit(
  uuid,
  uuid,
  text,
  jsonb,
  boolean
);
drop function if exists private.create_closet_outfit_record(
  uuid,
  uuid,
  text,
  jsonb,
  boolean
);

drop policy if exists closet_outfits_update_member
on public.closet_outfits;
drop policy if exists closet_items_insert_member
on public.closet_items;

revoke insert (
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
) on table public.closet_items from authenticated;

revoke update (
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
) on table public.closet_items from authenticated;

-- Restore the column-level UPDATE grants that existed before Phase 3.
grant update (
  rain_ok,
  long_walk_ok,
  updated_at
) on table public.closet_items to authenticated;

revoke update (
  display_name,
  rating,
  archived_at,
  updated_at
) on table public.closet_outfits from authenticated;

drop index if exists public.closet_item_images_one_ready_variant_idx;

create unique index closet_item_images_one_active_variant_idx
  on public.closet_item_images (workspace_id, item_id, variant)
  where status in ('pending', 'ready');

alter table public.closet_items
  drop constraint if exists closet_items_display_hex_format,
  drop column if exists display_hex;

alter table public.closet_outfits
  drop column if exists archived_at;

alter table public.closet_outfit_previews
  drop column if exists stale_at;

commit;
