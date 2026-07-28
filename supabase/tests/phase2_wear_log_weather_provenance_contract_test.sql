begin;

select plan(8);

select has_column(
  'public',
  'closet_wear_logs',
  'weather_location_id',
  'wear logs store the weather location reference'
);

select has_column(
  'public',
  'closet_wear_logs',
  'weather_issued_at',
  'wear logs store the forecast issue time'
);

select has_column(
  'public',
  'closet_wear_logs',
  'weather_overridden',
  'wear logs store whether forecast values were edited'
);

select ok(
  (
    select count(*) = 1
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and conname = 'closet_wear_logs_weather_location_owner_fkey'
      and contype = 'f'
  ),
  'weather provenance cannot cross workspace ownership'
);

select ok(
  (
    select count(*) = 1
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and conname = 'closet_wear_logs_weather_provenance_consistency'
      and contype = 'c'
  ),
  'weather metadata is required only for weather-sourced logs'
);

select has_index(
  'public',
  'closet_wear_logs',
  'closet_wear_logs_weather_location_workspace_fk_idx',
  'the weather provenance foreign key is indexed'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.closet_wear_logs',
    'weather_location_id',
    'INSERT'
  )
  and has_column_privilege(
    'authenticated',
    'public.closet_wear_logs',
    'weather_issued_at',
    'INSERT'
  )
  and has_column_privilege(
    'authenticated',
    'public.closet_wear_logs',
    'weather_overridden',
    'INSERT'
  ),
  'authenticated can insert the weather provenance columns'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.closet_wear_logs',
    'weather_location_id',
    'UPDATE'
  )
  and has_column_privilege(
    'authenticated',
    'public.closet_wear_logs',
    'weather_issued_at',
    'UPDATE'
  )
  and has_column_privilege(
    'authenticated',
    'public.closet_wear_logs',
    'weather_overridden',
    'UPDATE'
  ),
  'authenticated can update the weather provenance columns'
);

select * from finish();
rollback;
