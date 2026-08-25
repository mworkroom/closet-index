begin;

select plan(5);

select hasnt_table(
  'public',
  'closet_import_runs',
  'the completed one-time import log table is removed'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and policyname = 'closet_import_runs_select_member'
  ),
  0,
  'the Import Runs RLS policy is removed with the table'
);

select is(
  to_regclass('public.closet_import_runs_workspace_started_idx'),
  null::regclass,
  'the Import Runs index is removed with the table'
);

select is(
  (
    select count(*)::integer
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relkind = 'r'
      and relation.relname = any(array[
        'closet_items',
        'closet_outfits',
        'closet_wear_logs'
      ])
  ),
  3,
  'active Item, Outfit, and Wear Log tables remain available'
);

select has_function(
  'public',
  'create_closet_outfit',
  array['uuid', 'uuid', 'text', 'jsonb', 'boolean'],
  'the active Outfit create transaction remains available'
);

select * from finish();
rollback;
