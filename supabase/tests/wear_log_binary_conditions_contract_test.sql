begin;

select plan(6);

select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'closet_wear_logs'
      and column_name = 'rain_condition'
  ),
  '''no''::text',
  'rain condition defaults to no'
);

select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'closet_wear_logs'
      and column_name = 'long_walk_condition'
  ),
  '''no''::text',
  'long walk condition defaults to no'
);

select like(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and conname = 'closet_wear_logs_rain_condition_values'
  ),
  '%''no''%''yes''%',
  'rain condition accepts no and yes'
);

select unlike(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and conname = 'closet_wear_logs_rain_condition_values'
  ),
  '%unknown%',
  'rain condition rejects unknown'
);

select like(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and conname = 'closet_wear_logs_long_walk_condition_values'
  ),
  '%''no''%''yes''%',
  'long walk condition accepts no and yes'
);

select unlike(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and conname = 'closet_wear_logs_long_walk_condition_values'
  ),
  '%unknown%',
  'long walk condition rejects unknown'
);

select * from finish();

rollback;
