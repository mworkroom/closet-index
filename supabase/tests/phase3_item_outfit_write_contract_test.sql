begin;

select plan(35);

select has_column(
  'public',
  'closet_items',
  'display_hex',
  'items store a direct fallback HEX'
);

select col_not_null(
  'public',
  'closet_items',
  'display_hex',
  'the fallback HEX is required'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_items'::regclass
      and conname = 'closet_items_display_hex_format'
  ),
  'the fallback HEX has a format constraint'
);

select has_column(
  'public',
  'closet_outfits',
  'archived_at',
  'outfit archive state is separate from rating'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'closet_item_images_one_ready_variant_idx'
      and indexdef like '%status = ''ready''%'
  ),
  'only ready image metadata is unique per item variant'
);

select ok(
  not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'closet_item_images_one_active_variant_idx'
  ),
  'a pending replacement can coexist with the current ready image'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.closet_items',
    'id',
    'insert'
  ),
  'authenticated members can submit a client-generated Item UUID'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.closet_items',
    'name',
    'update'
  ),
  'authenticated members can edit Item names'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.closet_outfits',
    'archived_at',
    'update'
  ),
  'authenticated members can archive and restore Outfits'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.closet_outfits',
    'insert'
  ),
  'Outfit inserts are not granted directly'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.closet_outfit_items',
    'insert'
  ),
  'Outfit relation inserts are not granted directly'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'closet_items'
      and policyname = 'closet_items_insert_member'
      and cmd = 'INSERT'
      and with_check like '%is_workspace_member%'
  ),
  'Item inserts require workspace membership'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'closet_outfits'
      and policyname = 'closet_outfits_update_member'
      and cmd = 'UPDATE'
      and qual is not null
      and with_check is not null
  ),
  'Outfit updates require membership before and after'
);

select is(
  (
    select count(*)::integer
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any(array[
        'create_closet_outfit',
        'find_matching_closet_outfits'
      ])
  ),
  2,
  'the active Phase 3 Outfit RPC functions exist'
);

select is(
  (
    select count(*)::integer
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any(array[
        'create_closet_outfit',
        'find_matching_closet_outfits'
      ])
      and procedure.prosecdef
  ),
  2,
  'the active RPC functions use controlled security-definer boundaries'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_closet_outfit(uuid,uuid,text,jsonb,boolean)',
    'execute'
  ),
  'authenticated users can call the transactional Outfit creator'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_closet_outfit(uuid,uuid,text,jsonb,boolean)',
    'execute'
  ),
  'anonymous users cannot call the Outfit creator'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.find_matching_closet_outfits(uuid,uuid[])',
    'execute'
  ),
  'authenticated users can check exact Item combinations'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'private.create_closet_outfit_record(uuid,uuid,text,jsonb,boolean)',
    'execute'
  ),
  'the privileged helper is not directly callable by app users'
);

insert into auth.users (id, email)
values
  ('81000000-0000-0000-0000-000000000001', 'phase3-owner@example.test'),
  ('82000000-0000-0000-0000-000000000002', 'phase3-other@example.test');

insert into public.workspaces (id, name)
values
  ('83000000-0000-0000-0000-000000000001', 'Phase 3 workspace A'),
  ('83000000-0000-0000-0000-000000000002', 'Phase 3 workspace B');

insert into public.workspace_members (workspace_id, user_id, role)
values
  (
    '83000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    'admin'
  ),
  (
    '83000000-0000-0000-0000-000000000002',
    '82000000-0000-0000-0000-000000000002',
    'admin'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    insert into public.closet_items (
      id,
      workspace_id,
      name,
      category,
      semantic_color,
      display_hex,
      seasons,
      rain_ok,
      long_walk_ok
    )
    values (
      '84000000-0000-0000-0000-000000000001',
      '83000000-0000-0000-0000-000000000001',
      'Phase 3 Item',
      'Top',
      'Blue',
      '#293A5B',
      array['Spring'],
      true,
      true
    )
  $$,
  'a member can create an Item in their workspace'
);

select throws_ok(
  $$
    insert into public.closet_items (
      id,
      workspace_id,
      name,
      category,
      display_hex
    )
    values (
      '84000000-0000-0000-0000-000000000002',
      '83000000-0000-0000-0000-000000000002',
      'Forbidden Item',
      'Top',
      '#293A5B'
    )
  $$,
  '42501',
  null,
  'a member cannot create an Item in another workspace'
);

select lives_ok(
  $$
    select public.create_closet_outfit(
      '83000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000001',
      'Phase 3 Outfit',
      jsonb_build_array(
        jsonb_build_object(
          'item_id', '84000000-0000-0000-0000-000000000001',
          'slot', 'top',
          'sort_order', 0,
          'position_x', 0,
          'position_y', -12,
          'item_scale', 0.9,
          'z_index', 20
        )
      ),
      false
    )
  $$,
  'Outfit and relation are created in one RPC'
);

select is(
  (
    select count(*)
    from public.closet_outfit_items
    where workspace_id = '83000000-0000-0000-0000-000000000001'
      and outfit_id = '85000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'the Outfit relation was saved'
);

select lives_ok(
  $$
    select public.create_closet_outfit(
      '83000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000001',
      'Phase 3 Outfit',
      jsonb_build_array(
        jsonb_build_object(
          'item_id', '84000000-0000-0000-0000-000000000001',
          'slot', 'top',
          'sort_order', 0,
          'position_x', 0,
          'position_y', -12,
          'item_scale', 0.9,
          'z_index', 20
        )
      ),
      false
    )
  $$,
  'retrying the same client UUID and content is idempotent'
);

select is(
  (
    select count(*)
    from public.closet_outfits
    where id = '85000000-0000-0000-0000-000000000001'
  ),
  1::bigint,
  'idempotent retry keeps one Outfit'
);

select throws_ok(
  $$
    select public.create_closet_outfit(
      '83000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000002',
      'Unconfirmed duplicate',
      jsonb_build_array(
        jsonb_build_object(
          'item_id', '84000000-0000-0000-0000-000000000001',
          'slot', 'top',
          'sort_order', 0
        )
      ),
      false
    )
  $$,
  '23505',
  null,
  'the same Item combination requires explicit confirmation'
);

select throws_ok(
  $$
    select public.create_closet_outfit(
      '83000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000003',
      'Foreign Item',
      jsonb_build_array(
        jsonb_build_object(
          'item_id', '84000000-0000-0000-0000-000000000099',
          'slot', 'top',
          'sort_order', 0
        )
      ),
      true
    )
  $$,
  '42501',
  null,
  'an unknown or foreign Item rejects the whole Outfit'
);

select is(
  (
    select count(*)
    from public.closet_outfits
    where id = '85000000-0000-0000-0000-000000000003'
  ),
  0::bigint,
  'a failed relation leaves no partial Outfit'
);

select is(
  (
    select count(*)
    from public.find_matching_closet_outfits(
      '83000000-0000-0000-0000-000000000001',
      array['84000000-0000-0000-0000-000000000001']::uuid[]
    )
  ),
  1::bigint,
  'exact Item-set lookup finds the saved Outfit'
);

select lives_ok(
  $$
    select public.create_closet_outfit(
      '83000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000004',
      'Source-prefilled Outfit',
      jsonb_build_array(
        jsonb_build_object(
          'item_id', '84000000-0000-0000-0000-000000000001',
          'slot', 'top',
          'sort_order', 0
        )
      ),
      true
    )
  $$,
  'a source-prefilled Outfit can be saved through the creator'
);

select is(
  (
    select count(*)
    from public.closet_outfit_items
    where workspace_id = '83000000-0000-0000-0000-000000000001'
      and outfit_id = '85000000-0000-0000-0000-000000000004'
  ),
  1::bigint,
  'the independently created Outfit receives its own relation rows'
);

select ok(
  exists (
    select rating
    from public.closet_outfits
    where id = '85000000-0000-0000-0000-000000000001'
      and rating = 'ok'
  ),
  'creating another Outfit leaves the existing default rating unchanged'
);

select lives_ok(
  $$
    update public.closet_outfits
    set archived_at = now(), updated_at = now()
    where id = '85000000-0000-0000-0000-000000000004'
      and workspace_id = '83000000-0000-0000-0000-000000000001'
  $$,
  'a member can archive the newly created Outfit'
);

select ok(
  (
    select archived_at is not null
    from public.closet_outfits
    where id = '85000000-0000-0000-0000-000000000004'
  ),
  'the archived Outfit has a recoverable timestamp'
);

select ok(
  (
    select archived_at is null
    from public.closet_outfits
    where id = '85000000-0000-0000-0000-000000000001'
  ),
  'archiving the new Outfit leaves the existing Outfit active'
);

select * from finish();
rollback;
