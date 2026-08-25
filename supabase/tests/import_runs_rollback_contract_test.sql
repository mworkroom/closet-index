begin;

select plan(14);

select has_table(
  'public',
  'closet_import_runs',
  'the emergency rollback recreates the Import Runs table'
);

select is(
  (
    select count(*)::integer
    from pg_attribute
    where attrelid = 'public.closet_import_runs'::regclass
      and attnum > 0
      and not attisdropped
  ),
  9,
  'the rollback restores all nine columns'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_import_runs'::regclass
      and conname = 'closet_import_runs_pkey'
      and contype = 'p'
  ),
  'the rollback restores the primary key'
);

select is(
  (
    select count(*)::integer
    from pg_constraint
    where conrelid = 'public.closet_import_runs'::regclass
      and conname = any(array[
        'closet_import_runs_pkey',
        'closet_import_runs_source_values',
        'closet_import_runs_status_values',
        'closet_import_runs_workspace_id_fkey'
      ])
  ),
  4,
  'the rollback restores all named constraints'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_import_runs'::regclass
      and conname = 'closet_import_runs_workspace_id_fkey'
      and confrelid = 'public.workspaces'::regclass
      and confdeltype = 'r'
  ),
  'the rollback restores the restrictive workspace foreign key'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'closet_import_runs_workspace_started_idx'
      and indexdef like '%(workspace_id, started_at DESC)%'
  ),
  'the rollback restores the workspace and start-time index'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.closet_import_runs'::regclass
  ),
  'the rollback enables RLS'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'closet_import_runs'
      and policyname = 'closet_import_runs_select_member'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual like '%private.is_workspace_member%'
  ),
  1,
  'the rollback restores the authenticated member read policy'
);

select ok(
  has_table_privilege(
    'authenticated',
    'public.closet_import_runs',
    'select'
  ),
  'authenticated users regain read access'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.closet_import_runs',
    'insert'
  ),
  'authenticated users do not gain insert access'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.closet_import_runs',
    'select'
  ),
  'service_role regains read access'
);

select ok(
  has_table_privilege(
    'service_role',
    'public.closet_import_runs',
    'insert'
  ),
  'service_role regains write access'
);

select is(
  (
    select count(*)::integer
    from (
      select obj_description(
        'public.closet_import_runs'::regclass,
        'pg_class'
      ) as comment_text
      union all
      select col_description('public.closet_import_runs'::regclass, attnum)
      from pg_attribute
      where attrelid = 'public.closet_import_runs'::regclass
        and attname = any(array['source', 'status', 'counts', 'report'])
    ) comments
    where comment_text is not null
  ),
  5,
  'the rollback restores the table and lifecycle column comments'
);

select is(
  (select count(*)::integer from public.closet_import_runs),
  0,
  'the schema rollback leaves data restoration as a separate explicit step'
);

select * from finish();
rollback;
