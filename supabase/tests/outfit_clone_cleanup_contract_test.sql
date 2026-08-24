begin;

select plan(6);

select hasnt_function(
  'public',
  'clone_closet_outfit',
  array['uuid', 'uuid', 'uuid', 'text'],
  'the obsolete Outfit clone RPC signature is removed'
);

select is(
  (
    select count(*)::integer
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'clone_closet_outfit'
  ),
  0,
  'no Outfit clone RPC overload remains'
);

select has_function(
  'public',
  'create_closet_outfit',
  array['uuid', 'uuid', 'text', 'jsonb', 'boolean'],
  'the active Outfit create RPC remains available'
);

select has_function(
  'private',
  'create_closet_outfit_record',
  array['uuid', 'uuid', 'text', 'jsonb', 'boolean'],
  'the shared Outfit create helper remains available'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_closet_outfit(uuid,uuid,text,jsonb,boolean)',
    'execute'
  ),
  'authenticated users retain the public create boundary'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.create_closet_outfit_record(uuid,uuid,text,jsonb,boolean)',
    'execute'
  ),
  'authenticated users still cannot call the private helper directly'
);

select * from finish();
rollback;
