begin;

select plan(14);

select is(
  (
    select count(*)
    from storage.buckets
    where id = 'closet-images'
  ),
  1::bigint,
  'closet-images bucket exists'
);

select is(
  (
    select public
    from storage.buckets
    where id = 'closet-images'
  ),
  false,
  'closet-images bucket is private'
);

select is(
  (
    select file_size_limit
    from storage.buckets
    where id = 'closet-images'
  ),
  10485760::bigint,
  'closet-images bucket has a 10 MiB object limit'
);

select ok(
  (
    select allowed_mime_types @> array[
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/heic',
      'image/heif'
    ]::text[]
    from storage.buckets
    where id = 'closet-images'
  ),
  'closet-images bucket allows only planned image formats'
);

select has_index(
  'public',
  'closet_item_images',
  'closet_item_images_one_active_variant_idx',
  'one pending or ready image exists per item variant'
);

select has_index(
  'public',
  'closet_outfit_previews',
  'closet_outfit_previews_outfit_version_unique_idx',
  'one preview exists per outfit composition version'
);

select is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.closet_item_images'::regclass
      and conname = 'closet_item_images_storage_path_matches_owner'
  ),
  1::bigint,
  'item image path ownership constraint exists'
);

select is(
  (
    select count(*)
    from pg_constraint
    where conrelid = 'public.closet_outfit_previews'::regclass
      and conname = 'closet_outfit_previews_storage_path_matches_owner'
  ),
  1::bigint,
  'outfit preview path ownership constraint exists'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'closet_item_images'
      and policyname = 'closet_item_images_select_ready_member'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual like '%status = ''ready''%'
      and qual like '%is_workspace_member%'
  ),
  1::bigint,
  'item metadata is ready-only and member-only'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'closet_outfit_previews'
      and policyname = 'closet_outfit_previews_select_ready_member'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual like '%status = ''ready''%'
      and qual like '%is_workspace_member%'
  ),
  1::bigint,
  'outfit metadata is ready-only and member-only'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'closet_images_select_ready_member'
  ),
  1::bigint,
  'closet image object read policy exists'
);

select is(
  (
    select cmd
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'closet_images_select_ready_member'
  ),
  'SELECT',
  'closet image object policy grants read only'
);

select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'closet_images_%'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0::bigint,
  'authenticated app users receive no closet image write policy'
);

select is(
  (
    select count(*)
    from pg_policies
    where (
      (
        schemaname = 'storage'
        and tablename = 'objects'
        and policyname = 'closet_images_select_ready_member'
      )
      or (
        schemaname = 'public'
        and tablename in ('closet_item_images', 'closet_outfit_previews')
        and policyname like '%select_ready_member'
      )
    )
    and roles && array['anon']::name[]
  ),
  0::bigint,
  'anonymous users receive no image or metadata policy'
);

select * from finish();
rollback;
