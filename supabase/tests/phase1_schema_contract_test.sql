begin;

select plan(35);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname = any(array[
        'closet_color_palette',
        'closet_items',
        'closet_outfits',
        'closet_outfit_items',
        'closet_places',
        'closet_transport_modes',
        'closet_wear_logs',
        'closet_replacement_lines',
        'closet_replacement_line_items',
        'closet_item_images',
        'closet_outfit_previews',
        'closet_import_runs'
      ])
  ),
  12,
  'all Phase 1 tables exist'
);

select is(
  (
    select count(*)::integer
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'closet_color_palette',
        'closet_items',
        'closet_outfits',
        'closet_outfit_items',
        'closet_places',
        'closet_transport_modes',
        'closet_wear_logs',
        'closet_replacement_lines',
        'closet_replacement_line_items',
        'closet_item_images',
        'closet_outfit_previews',
        'closet_import_runs'
      ])
      and c.relrowsecurity
  ),
  12,
  'RLS is enabled on every Phase 1 table'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and contype = 'p'
  ),
  'wear_logs has a primary key'
);

select ok(
  not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%outfit_id%'
      and pg_get_constraintdef(oid) like '%worn_on%'
  ),
  'date plus outfit is intentionally not unique'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and conname = 'closet_wear_logs_workspace_submission_unique'
  ),
  'submission token is unique per owner'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_outfits'::regclass
      and conname = 'closet_outfits_rating_values'
      and pg_get_constraintdef(oid) like '%favorite%'
      and pg_get_constraintdef(oid) like '%error%'
  ),
  'outfit rating is one mutually exclusive state'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and conname = 'closet_wear_logs_temperature_out_range'
  ),
  'departure temperature has a database range check'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and conname = 'closet_wear_logs_feeling_out_values'
  ),
  'thermal feeling values are constrained'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_wear_logs'::regclass
      and conname = 'closet_wear_logs_outfit_owner_fkey'
  ),
  'wear log and outfit ownership must match'
);

select ok(
  coalesce(
    (
      select c.reloptions @> array['security_invoker=true']
      from pg_class c
      where c.oid = 'public.closet_outfit_stats'::regclass
    ),
    false
  ),
  'outfit_stats is a security invoker view'
);

select ok(
  coalesce(
    (
      select c.reloptions @> array['security_invoker=true']
      from pg_class c
      where c.oid = 'public.closet_item_stats'::regclass
    ),
    false
  ),
  'item_stats is a security invoker view'
);

select ok(
  has_table_privilege('authenticated', 'public.closet_items', 'select'),
  'authenticated users can read items'
);

select ok(
  not has_table_privilege('authenticated', 'public.closet_items', 'insert'),
  'authenticated users cannot create items in Phase 1'
);

select ok(
  has_column_privilege('authenticated', 'public.closet_items', 'rain_ok', 'update'),
  'authenticated users can update rain suitability'
);

select ok(
  has_column_privilege('authenticated', 'public.closet_items', 'long_walk_ok', 'update'),
  'authenticated users can update walking suitability'
);

select is(
  (
    select data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'closet_items'
      and column_name = 'rain_ok'
  ),
  'boolean',
  'rain suitability is a boolean exception flag'
);

select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'closet_items'
      and column_name = 'rain_ok'
  ),
  'true',
  'rain suitability defaults to allowed'
);

select is(
  (
    select data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'closet_items'
      and column_name = 'long_walk_ok'
  ),
  'boolean',
  'walking suitability is a boolean exception flag'
);

select is(
  (
    select column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'closet_items'
      and column_name = 'long_walk_ok'
  ),
  'true',
  'walking suitability defaults to allowed'
);

select ok(
  not has_column_privilege('authenticated', 'public.closet_items', 'name', 'update'),
  'authenticated users cannot update item names'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.closet_outfit_items',
    'position_x',
    'update'
  )
  and has_column_privilege(
    'authenticated',
    'public.closet_outfit_items',
    'position_y',
    'update'
  )
  and has_column_privilege(
    'authenticated',
    'public.closet_outfit_items',
    'scale',
    'update'
  ),
  'authenticated users can update outfit item positions and scale'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.closet_outfit_items',
    'slot',
    'update'
  )
  and has_column_privilege(
    'authenticated',
    'public.closet_outfit_items',
    'z_index',
    'update'
  ),
  'authenticated users can update outfit item display slot and layer'
);

select ok(
  not has_column_privilege(
    'anon',
    'public.closet_outfit_items',
    'position_x',
    'update'
  ),
  'anonymous users cannot update outfit item positions'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'closet_outfit_items'
      and policyname = 'closet_outfit_items_update_position_member'
      and cmd = 'UPDATE'
      and qual is not null
      and with_check is not null
  ),
  'outfit item position updates require workspace membership before and after'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.closet_wear_logs',
    'outfit_id',
    'insert'
  ),
  'authenticated users can create wear logs'
);

select ok(
  has_table_privilege('authenticated', 'public.closet_wear_logs', 'delete'),
  'authenticated users can delete wear logs'
);

select ok(
  not has_table_privilege('anon', 'public.closet_items', 'select'),
  'anonymous users cannot read items'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = any(array[
        'closet_color_palette',
        'closet_items',
        'closet_outfits',
        'closet_outfit_items',
        'closet_places',
        'closet_transport_modes',
        'closet_wear_logs',
        'closet_replacement_lines',
        'closet_replacement_line_items',
        'closet_item_images',
        'closet_outfit_previews',
        'closet_import_runs'
      ])
  ),
  17,
  'expected workspace member policies are installed'
);

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'owner-a@example.test'),
  ('20000000-0000-0000-0000-000000000002', 'owner-b@example.test');

insert into public.workspaces (id, name)
values
  ('30000000-0000-0000-0000-000000000001', 'Contract workspace A'),
  ('30000000-0000-0000-0000-000000000002', 'Contract workspace B');

insert into public.workspace_members (workspace_id, user_id, role)
values
  (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'admin'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'admin'
  );

insert into public.closet_items (
  id,
  workspace_id,
  name,
  category
)
values (
  '11000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Contract item',
  'Top'
);

insert into public.closet_outfits (
  id,
  workspace_id,
  display_name,
  rating
)
values (
  '12000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Contract outfit',
  'favorite'
);

insert into public.closet_outfit_items (
  workspace_id,
  outfit_id,
  item_id,
  sort_order
)
values (
  '30000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000001',
  '11000000-0000-0000-0000-000000000001',
  0
);

select lives_ok(
  $$
    insert into public.closet_wear_logs (
      id,
      workspace_id,
      outfit_id,
      worn_on,
      temp_out,
      feeling_out,
      submission_token
    )
    values
      (
        '13000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001',
        '12000000-0000-0000-0000-000000000001',
        '2026-07-26',
        20,
        'ok',
        '14000000-0000-0000-0000-000000000001'
      ),
      (
        '13000000-0000-0000-0000-000000000002',
        '30000000-0000-0000-0000-000000000001',
        '12000000-0000-0000-0000-000000000001',
        '2026-07-26',
        20,
        'ok',
        '14000000-0000-0000-0000-000000000002'
      )
  $$,
  'same owner, date, and outfit can be recorded twice'
);

select is(
  (
    select count(*)
    from public.closet_wear_logs
    where workspace_id = '30000000-0000-0000-0000-000000000001'
      and outfit_id = '12000000-0000-0000-0000-000000000001'
      and worn_on = '2026-07-26'
  ),
  2::bigint,
  'both same-day wear logs remain independent'
);

select is(
  (
    select wear_count
    from public.closet_outfit_stats
    where workspace_id = '30000000-0000-0000-0000-000000000001'
      and outfit_id = '12000000-0000-0000-0000-000000000001'
  ),
  2::bigint,
  'outfit statistics include both logs'
);

select is(
  (
    select wear_count
    from public.closet_item_stats
    where workspace_id = '30000000-0000-0000-0000-000000000001'
      and item_id = '11000000-0000-0000-0000-000000000001'
  ),
  2::bigint,
  'item statistics include both logs'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.closet_wear_logs),
  2::bigint,
  'workspace member can read both wear logs through RLS'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.closet_wear_logs),
  0::bigint,
  'a non-member cannot read those wear logs'
);

reset role;

select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and indexname = any(array[
        'closet_wear_logs_workspace_worn_on_id_idx',
        'closet_wear_logs_workspace_outfit_worn_on_idx',
        'closet_outfit_items_workspace_item_idx',
        'closet_replacement_line_items_workspace_item_idx'
      ])
  ),
  4,
  'critical relation and wear-log indexes exist'
);

select * from finish();
rollback;
