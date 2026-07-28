begin;

select plan(8);

select has_table(
  'public',
  'closet_weather_locations',
  'weather locations table exists'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.closet_weather_locations'::regclass
  ),
  'weather locations table has RLS enabled'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'closet_weather_locations'
      and policyname = any(array[
        'closet_weather_locations_select_member',
        'closet_weather_locations_insert_member',
        'closet_weather_locations_update_member',
        'closet_weather_locations_delete_member'
      ])
  ),
  4,
  'workspace membership policies cover select, insert, update, and delete'
);

select is(
  (
    select count(distinct privilege_type)::integer
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'closet_weather_locations'
      and grantee = 'authenticated'
      and privilege_type = any(array['INSERT', 'UPDATE'])
  ),
  2,
  'authenticated has explicit write-column privileges separate from RLS'
);

select has_index(
  'public',
  'closet_weather_locations',
  'closet_weather_locations_one_default_per_workspace_idx',
  'each workspace can have at most one default location'
);

select is(
  (
    select label || ':' || nx || ',' || ny
    from public.closet_weather_locations
    where workspace_id = '00000000-0000-0000-0000-000000000003'
      and is_default
  ),
  '창4동:61,129',
  'the confirmed Chang 4-dong KMA grid is stored as the initial default'
);

select throws_ok(
  $$
    insert into public.closet_weather_locations (
      workspace_id,
      label,
      nx,
      ny
    )
    values (
      '00000000-0000-0000-0000-000000000003',
      'invalid-grid',
      0,
      129
    )
  $$,
  '23514',
  null,
  'nx must be a positive integer'
);

select throws_ok(
  $$
    insert into public.closet_weather_locations (
      workspace_id,
      label,
      admin_code,
      nx,
      ny
    )
    values (
      '00000000-0000-0000-0000-000000000003',
      'invalid-admin-code',
      '1234',
      61,
      129
    )
  $$,
  '23514',
  null,
  'an administrative code must contain ten digits'
);

select * from finish();
rollback;
