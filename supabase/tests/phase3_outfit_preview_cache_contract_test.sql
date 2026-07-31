begin;

select plan(18);

select has_column(
  'public',
  'closet_outfit_previews',
  'source_fingerprint',
  'preview cache stores its browser composition fingerprint'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_outfit_previews'::regclass
      and conname = 'closet_outfit_previews_source_fingerprint_format'
  ),
  'preview source fingerprints are validated'
);

select has_function(
  'public',
  'begin_closet_outfit_preview_upload',
  array['uuid', 'uuid', 'uuid', 'integer', 'integer', 'integer', 'text'],
  'begin preview upload function exists'
);

select has_function(
  'public',
  'finalize_closet_outfit_preview_upload',
  array['uuid', 'uuid', 'uuid'],
  'finalize preview upload function exists'
);

select has_function(
  'public',
  'cancel_closet_outfit_preview_upload',
  array['uuid', 'uuid', 'uuid'],
  'cancel preview upload function exists'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.begin_closet_outfit_preview_upload(uuid,uuid,uuid,integer,integer,integer,text)'::regprocedure
  ),
  'begin preview function is security definer'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.finalize_closet_outfit_preview_upload(uuid,uuid,uuid)'::regprocedure
  ),
  'finalize preview function is security definer'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.begin_closet_outfit_preview_upload(uuid,uuid,uuid,integer,integer,integer,text)',
    'execute'
  ),
  'authenticated clients cannot create preview metadata directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.begin_closet_outfit_preview_upload(uuid,uuid,uuid,integer,integer,integer,text)',
    'execute'
  ),
  'the authenticated Edge Function service boundary can begin previews'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.finalize_closet_outfit_preview_upload(uuid,uuid,uuid)',
    'execute'
  ),
  'anonymous clients cannot finalize previews'
);

select is(
  (
    select count(*)::integer
    from pg_trigger
    where tgrelid = 'public.closet_outfit_items'::regclass
      and tgname = 'closet_outfit_items_mark_preview_stale'
      and not tgisinternal
  ),
  1,
  'Outfit relation changes mark previews stale'
);

select is(
  (
    select count(*)::integer
    from pg_trigger
    where tgrelid = 'public.closet_item_images'::regclass
      and tgname = 'closet_item_images_mark_preview_stale'
      and not tgisinternal
  ),
  1,
  'ready cutout changes mark related previews stale'
);

select ok(
  pg_get_functiondef(
    'public.begin_closet_outfit_preview_upload(uuid,uuid,uuid,integer,integer,integer,text)'::regprocedure
  ) like '%for update%',
  'version allocation locks the owning Outfit against races'
);

select ok(
  pg_get_functiondef(
    'public.begin_closet_outfit_preview_upload(uuid,uuid,uuid,integer,integer,integer,text)'::regprocedure
  ) like '%status = ''pending''%',
  'begin records pending metadata before upload'
);

select ok(
  pg_get_functiondef(
    'public.finalize_closet_outfit_preview_upload(uuid,uuid,uuid)'::regprocedure
  ) like '%from storage.objects%',
  'finalize verifies the uploaded Storage object'
);

select ok(
  pg_get_functiondef(
    'public.finalize_closet_outfit_preview_upload(uuid,uuid,uuid)'::regprocedure
  ) like '%status = ''ready''%',
  'finalize promotes the new preview to ready'
);

select ok(
  pg_get_functiondef(
    'public.finalize_closet_outfit_preview_upload(uuid,uuid,uuid)'::regprocedure
  ) like '%status = ''error''%',
  'older ready metadata is retired only during successful finalization'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'closet_outfit_previews'
      and policyname = 'closet_outfit_previews_select_member'
      and qual like '%is_workspace_member%'
  ),
  'members can inspect preview management states in their own workspace'
);

select * from finish();
rollback;
