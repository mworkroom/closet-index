-- Phase 1B keeps personal clothing images private and exposes only ready assets
-- that belong to one of the signed-in user's workspaces.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'closet-images',
  'closet-images',
  false,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/heic',
    'image/heif'
  ]::text[]
);

alter table public.closet_item_images
  add constraint closet_item_images_storage_path_matches_owner check (
    (
      variant = 'cutout'
      and storage_path =
        workspace_id::text
        || '/items/'
        || item_id::text
        || '/cutout/'
        || id::text
        || '.webp'
    )
    or (
      variant = 'original'
      and storage_path ~ (
        '^'
        || workspace_id::text
        || '/items/'
        || item_id::text
        || '/original/'
        || id::text
        || '\.(png|jpe?g|webp|heic|heif)$'
      )
    )
  );

alter table public.closet_outfit_previews
  add constraint closet_outfit_previews_storage_path_matches_owner check (
    storage_path =
      workspace_id::text
      || '/outfits/'
      || outfit_id::text
      || '/preview/v'
      || composition_version::text
      || '.webp'
  );

create unique index closet_item_images_one_active_variant_idx
  on public.closet_item_images (workspace_id, item_id, variant)
  where status in ('pending', 'ready');

create unique index closet_outfit_previews_outfit_version_unique_idx
  on public.closet_outfit_previews (
    workspace_id,
    outfit_id,
    composition_version
  );

drop policy closet_item_images_select_member
on public.closet_item_images;

create policy closet_item_images_select_ready_member
on public.closet_item_images
for select
to authenticated
using (
  status = 'ready'
  and (select private.is_workspace_member(workspace_id))
);

drop policy closet_outfit_previews_select_member
on public.closet_outfit_previews;

create policy closet_outfit_previews_select_ready_member
on public.closet_outfit_previews
for select
to authenticated
using (
  status = 'ready'
  and (select private.is_workspace_member(workspace_id))
);

create policy closet_images_select_ready_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'closet-images'
  and case
    when (storage.foldername(name))[1] ~* (
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
      || '[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    then (
      select private.is_workspace_member(
        ((storage.foldername(name))[1])::uuid
      )
    )
    else false
  end
  and (
    exists (
      select 1
      from public.closet_item_images image
      where image.storage_path = name
        and image.status = 'ready'
    )
    or exists (
      select 1
      from public.closet_outfit_previews preview
      where preview.storage_path = name
        and preview.status = 'ready'
    )
  )
);
