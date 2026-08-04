begin;

select plan(8);

select hasnt_table(
  'public',
  'closet_outfit_previews',
  'derived Outfit preview metadata is removed'
);

select hasnt_function(
  'public',
  'begin_closet_outfit_preview_upload',
  array['uuid', 'uuid', 'uuid', 'integer', 'integer', 'integer', 'text'],
  'preview upload begin RPC is removed'
);

select hasnt_function(
  'public',
  'finalize_closet_outfit_preview_upload',
  array['uuid', 'uuid', 'uuid'],
  'preview upload finalize RPC is removed'
);

select hasnt_function(
  'public',
  'cancel_closet_outfit_preview_upload',
  array['uuid', 'uuid', 'uuid'],
  'preview upload cancel RPC is removed'
);

select ok(
  pg_get_functiondef(
    'public.delete_closet_outfit_if_unworn(uuid,uuid,uuid)'::regprocedure
  ) not like '%closet_outfit_previews%',
  'Outfit deletion no longer depends on preview metadata'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.delete_closet_outfit_if_unworn(uuid,uuid,uuid)',
    'execute'
  ),
  'authenticated clients cannot bypass the deletion Edge Function'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.delete_closet_outfit_if_unworn(uuid,uuid,uuid)',
    'execute'
  ),
  'the deletion Edge Function can execute the protected RPC'
);

select ok(
  (
    select qual
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'closet_images_select_ready_member'
  ) not like '%closet_outfit_previews%',
  'Storage read policy depends only on retained Item image metadata'
);

select * from finish();
rollback;
