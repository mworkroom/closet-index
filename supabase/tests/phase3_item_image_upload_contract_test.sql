begin;

select plan(15);

select has_function(
  'public',
  'begin_closet_item_image_upload',
  array['uuid', 'uuid', 'uuid', 'integer', 'integer', 'integer'],
  'begin image upload function exists'
);

select has_function(
  'public',
  'finalize_closet_item_image_upload',
  array['uuid', 'uuid', 'uuid'],
  'finalize image upload function exists'
);

select has_function(
  'public',
  'cancel_closet_item_image_upload',
  array['uuid', 'uuid', 'uuid'],
  'cancel image upload function exists'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.begin_closet_item_image_upload(uuid,uuid,uuid,integer,integer,integer)'::regprocedure
  ),
  true,
  'begin function is security definer'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.finalize_closet_item_image_upload(uuid,uuid,uuid)'::regprocedure
  ),
  true,
  'finalize function is security definer'
);

select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.cancel_closet_item_image_upload(uuid,uuid,uuid)'::regprocedure
  ),
  true,
  'cancel function is security definer'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.begin_closet_item_image_upload(uuid,uuid,uuid,integer,integer,integer)',
    'EXECUTE'
  ),
  'anon cannot begin uploads'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.finalize_closet_item_image_upload(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot finalize uploads directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.cancel_closet_item_image_upload(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot cancel uploads directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.begin_closet_item_image_upload(uuid,uuid,uuid,integer,integer,integer)',
    'EXECUTE'
  ),
  'service role can begin uploads'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.finalize_closet_item_image_upload(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'service role can finalize uploads'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.cancel_closet_item_image_upload(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'service role can cancel uploads'
);

select ok(
  pg_get_functiondef(
    'public.begin_closet_item_image_upload(uuid,uuid,uuid,integer,integer,integer)'::regprocedure
  ) like '%status = ''pending''%',
  'begin function records pending metadata'
);

select ok(
  pg_get_functiondef(
    'public.finalize_closet_item_image_upload(uuid,uuid,uuid)'::regprocedure
  ) like '%from storage.objects%',
  'finalize function verifies the uploaded object'
);

select ok(
  pg_get_functiondef(
    'public.finalize_closet_item_image_upload(uuid,uuid,uuid)'::regprocedure
  ) like '%status = ''ready''%',
  'finalize function promotes metadata to ready'
);

select * from finish();
rollback;
