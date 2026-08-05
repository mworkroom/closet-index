begin;

select plan(25);

select has_column(
  'public',
  'closet_items',
  'current_quantity',
  'Items store a nullable current quantity snapshot'
);

select col_type_is(
  'public',
  'closet_items',
  'current_quantity',
  'integer',
  'current quantity uses an integer'
);

select col_is_null(
  'public',
  'closet_items',
  'current_quantity',
  'current quantity distinguishes missing from zero'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_items'::regclass
      and conname = 'closet_items_current_quantity_nonnegative'
  ),
  'current quantity has a nonnegative constraint'
);

select has_table(
  'public',
  'closet_purchase_events',
  'PurchaseEvent history has a live table'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.closet_purchase_events'::regclass),
  'PurchaseEvent history has RLS enabled'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_purchase_events'::regclass
      and conname = 'closet_purchase_events_quantity_positive'
  ),
  'purchase quantity must be positive'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_purchase_events'::regclass
      and conname = 'closet_purchase_events_item_owner_fkey'
      and pg_get_constraintdef(oid) like '%ON DELETE CASCADE%'
  ),
  'PurchaseEvent ownership matches its Item and follows Item deletion'
);

select has_index(
  'public',
  'closet_purchase_events',
  'closet_purchase_events_item_date_idx',
  'Item history lookup has a composite index'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'closet_purchase_events'
      and cmd = any(array['SELECT', 'UPDATE', 'DELETE'])
  ),
  3,
  'PurchaseEvents have member-scoped read, correction, and deletion policies'
);

select ok(
  has_table_privilege('authenticated', 'public.closet_purchase_events', 'select')
  and has_table_privilege('authenticated', 'public.closet_purchase_events', 'delete'),
  'authenticated members can read and delete PurchaseEvents'
);

select ok(
  not has_table_privilege('authenticated', 'public.closet_purchase_events', 'insert'),
  'PurchaseEvent creation is restricted to the atomic RPC'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.closet_purchase_events',
    'quantity',
    'update'
  )
  and has_column_privilege(
    'authenticated',
    'public.closet_items',
    'current_quantity',
    'update'
  ),
  'members can correct event quantities and replace the quantity snapshot'
);

select has_function(
  'public',
  'create_closet_purchase_event',
  array['uuid', 'uuid', 'uuid', 'date', 'integer', 'integer'],
  'atomic repurchase creation RPC exists'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.create_closet_purchase_event(uuid,uuid,uuid,date,integer,integer)'::regprocedure),
  'atomic repurchase creation uses a controlled security-definer boundary'
);

select is(
  (select proconfig from pg_proc where oid = 'public.create_closet_purchase_event(uuid,uuid,uuid,date,integer,integer)'::regprocedure),
  array['search_path=""'],
  'atomic repurchase creation pins an empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_closet_purchase_event(uuid,uuid,uuid,date,integer,integer)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.create_closet_purchase_event(uuid,uuid,uuid,date,integer,integer)',
    'execute'
  ),
  'only authenticated callers can execute the atomic RPC'
);

insert into auth.users (id, email)
values
  ('91000000-0000-0000-0000-000000000001', 'p6-owner@example.test'),
  ('92000000-0000-0000-0000-000000000002', 'p6-other@example.test');

insert into public.workspaces (id, name)
values
  ('93000000-0000-0000-0000-000000000001', 'P6 workspace A'),
  ('93000000-0000-0000-0000-000000000002', 'P6 workspace B');

insert into public.workspace_members (workspace_id, user_id, role)
values
  (
    '93000000-0000-0000-0000-000000000001',
    '91000000-0000-0000-0000-000000000001',
    'admin'
  ),
  (
    '93000000-0000-0000-0000-000000000002',
    '92000000-0000-0000-0000-000000000002',
    'admin'
  );

insert into public.closet_items (
  id,
  workspace_id,
  name,
  category,
  display_hex,
  seasons,
  acquired_on
)
values
  (
    '94000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    'P6 Socks',
    'Socks',
    '#222222',
    array['Summer'],
    '2026-01-10'
  ),
  (
    '94000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000002',
    'Other Socks',
    'Socks',
    '#333333',
    array['Summer'],
    '2026-01-10'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.create_closet_purchase_event(
      '93000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000001',
      '2026-02-01',
      2,
      3
    )
  $$,
  'a member atomically records a purchase and final quantity'
);

select is(
  (
    select current_quantity
    from public.closet_items
    where id = '94000000-0000-0000-0000-000000000001'
  ),
  3,
  'atomic creation replaces the current quantity snapshot'
);

select is(
  (
    select count(*)::integer
    from public.closet_purchase_events
    where item_id = '94000000-0000-0000-0000-000000000001'
  ),
  1,
  'atomic creation inserts exactly one PurchaseEvent'
);

select lives_ok(
  $$
    select public.create_closet_purchase_event(
      '93000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000001',
      '2026-02-01',
      2,
      3
    )
  $$,
  'retrying the same event id and content is idempotent'
);

select is(
  (
    select count(*)::integer
    from public.closet_purchase_events
    where item_id = '94000000-0000-0000-0000-000000000001'
  ),
  1,
  'an idempotent retry does not duplicate history'
);

select throws_ok(
  $$
    select public.create_closet_purchase_event(
      '93000000-0000-0000-0000-000000000001',
      '95000000-0000-0000-0000-000000000002',
      '94000000-0000-0000-0000-000000000001',
      '2026-01-09',
      1,
      9
    )
  $$,
  '22023',
  'purchase date cannot be before the initial acquisition date',
  'a date before the initial acquisition is rejected'
);

select is(
  (
    select count(*)::integer
    from public.closet_purchase_events
    where item_id = '94000000-0000-0000-0000-000000000001'
  ),
  1,
  'a rejected RPC leaves history unchanged'
);

select is(
  (
    select current_quantity
    from public.closet_items
    where id = '94000000-0000-0000-0000-000000000001'
  ),
  3,
  'a rejected RPC leaves the current quantity unchanged'
);

select * from finish();
rollback;
