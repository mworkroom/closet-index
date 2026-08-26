begin;

select plan(37);

select hasnt_table(
  'public',
  'closet_replacement_legacy_links',
  'the completed Legacy Link review table is removed'
);

select hasnt_table(
  'public',
  'closet_replacement_legacy_link_revisions',
  'the completed Legacy Link revision table is removed'
);

select hasnt_column(
  'public',
  'closet_replacement_line_edges',
  'source_legacy_link_id',
  'lineage edges no longer retain the transitional Legacy source foreign key'
);

select hasnt_column(
  'public',
  'closet_replacement_line_edges',
  'source_kind',
  'lineage edges no longer retain the redundant source discriminator'
);

select hasnt_function(
  'public',
  'review_closet_replacement_legacy_link',
  array['uuid', 'uuid', 'text', 'text'],
  'the initial Legacy review RPC is removed'
);

select hasnt_function(
  'public',
  'revise_closet_replacement_legacy_link',
  array['uuid', 'uuid', 'timestamp with time zone', 'text', 'text'],
  'the Legacy revision RPC is removed'
);

select hasnt_function(
  'public',
  'confirm_closet_replacement_line_edge',
  array[
    'uuid',
    'uuid',
    'uuid',
    'timestamp with time zone',
    'text',
    'text'
  ],
  'the singular Legacy edge confirmation RPC is removed'
);

select hasnt_function(
  'public',
  'confirm_closet_replacement_line_edges',
  array['uuid', 'jsonb'],
  'the batch Legacy edge confirmation RPC is removed'
);

select hasnt_function(
  'private',
  'mark_legacy_link_edge_needs_review',
  array[]::text[],
  'the Legacy invalidation trigger helper is removed'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_trigger trigger
    where trigger.tgname = 'mark_legacy_link_edge_needs_review'
      and not trigger.tgisinternal
  ),
  0,
  'the Legacy invalidation trigger is removed'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'public.closet_replacement_line_edges'::regclass
      and constraint_row.conname = any(array[
        'closet_replacement_line_edges_source_owner_fkey',
        'closet_replacement_line_edges_source_contract',
        'closet_replacement_line_edges_source_kind',
        'closet_replacement_line_edges_source_unique'
      ])
  ),
  0,
  'all four Legacy source constraints are removed'
);

select is(
  to_regclass('public.closet_replacement_line_edges_source_workspace_fk_idx'),
  null::regclass,
  'the Legacy source foreign-key index is removed'
);

select has_function(
  'public',
  'create_closet_replacement_manual_edge',
  array['uuid', 'uuid', 'uuid', 'uuid', 'text', 'text'],
  'manual lineage edge creation remains available'
);

select has_function(
  'public',
  'update_closet_replacement_line_edge_connection',
  array[
    'uuid',
    'uuid',
    'timestamp with time zone',
    'uuid',
    'text',
    'text'
  ],
  'lineage edge connection editing remains available'
);

select has_function(
  'public',
  'reverse_closet_replacement_line_edge',
  array['uuid', 'uuid', 'timestamp with time zone'],
  'lineage edge reversal remains available'
);

select has_function(
  'private',
  'validate_closet_replacement_line_edge',
  array[]::text[],
  'the lineage graph validator remains available'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_trigger trigger
    where trigger.tgrelid = 'public.closet_replacement_line_edges'::regclass
      and trigger.tgname = 'validate_closet_replacement_line_edge'
      and not trigger.tgisinternal
  ),
  1,
  'the lineage graph validator trigger remains installed once'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    where procedure.oid = any(array[
      'private.validate_closet_replacement_line_edge()'::regprocedure,
      'public.create_closet_replacement_manual_edge(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure,
      'public.reverse_closet_replacement_line_edge(uuid,uuid,timestamptz)'::regprocedure
    ])
      and procedure.prosecdef
  ),
  4,
  'all retained cleanup-boundary functions remain security definers'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    where procedure.oid = any(array[
      'private.validate_closet_replacement_line_edge()'::regprocedure,
      'public.create_closet_replacement_manual_edge(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure,
      'public.reverse_closet_replacement_line_edge(uuid,uuid,timestamptz)'::regprocedure
    ])
      and procedure.proconfig = array['search_path=""']
  ),
  4,
  'all retained cleanup-boundary functions pin an empty search_path'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    where procedure.oid = any(array[
      'private.validate_closet_replacement_line_edge()'::regprocedure,
      'public.create_closet_replacement_manual_edge(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure,
      'public.reverse_closet_replacement_line_edge(uuid,uuid,timestamptz)'::regprocedure
    ])
      and pg_get_functiondef(procedure.oid) !~
        'closet_replacement_legacy|source_legacy_link_id|source_kind'
  ),
  4,
  'retained functions have no textual dependency on removed Legacy objects'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.create_closet_replacement_manual_edge(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure,
      'public.reverse_closet_replacement_line_edge(uuid,uuid,timestamptz)'::regprocedure
    ]) procedure_oid
    where has_function_privilege('authenticated', procedure_oid, 'execute')
  ),
  3,
  'authenticated members retain execute access to all three active RPCs'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.create_closet_replacement_manual_edge(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure,
      'public.reverse_closet_replacement_line_edge(uuid,uuid,timestamptz)'::regprocedure
    ]) procedure_oid
    where has_function_privilege('service_role', procedure_oid, 'execute')
  ),
  3,
  'service_role retains execute access to all three active RPCs'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.create_closet_replacement_manual_edge(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure,
      'public.reverse_closet_replacement_line_edge(uuid,uuid,timestamptz)'::regprocedure
    ]) procedure_oid
    where has_function_privilege('anon', procedure_oid, 'execute')
  ),
  0,
  'anonymous users cannot execute active lineage mutation RPCs'
);

select is(
  (
    select count(*)::integer
    from public.closet_replacement_line_edges
    where workspace_id = '51000000-0000-0000-0000-000000000001'
  ),
  2,
  'both synthetic lineage edges survive the cleanup'
);

select is(
  (
    select jsonb_build_object(
      'id', edge.id,
      'workspace_id', edge.workspace_id,
      'replacement_line_id', edge.replacement_line_id,
      'predecessor_item_id', edge.predecessor_item_id,
      'successor_item_id', edge.successor_item_id,
      'branch_name', edge.branch_name,
      'decision_reason', edge.decision_reason,
      'status', edge.status,
      'confirmed_at', edge.confirmed_at,
      'confirmed_by', edge.confirmed_by,
      'created_at', edge.created_at,
      'updated_at', edge.updated_at
    )
    from public.closet_replacement_line_edges edge
    where edge.id = '55000000-0000-0000-0000-000000000001'
  ),
  jsonb_build_object(
    'id', '55000000-0000-0000-0000-000000000001'::uuid,
    'workspace_id', '51000000-0000-0000-0000-000000000001'::uuid,
    'replacement_line_id', '52000000-0000-0000-0000-000000000001'::uuid,
    'predecessor_item_id', '51100000-0000-0000-0000-000000000001'::uuid,
    'successor_item_id', '51200000-0000-0000-0000-000000000001'::uuid,
    'branch_name', 'Original branch',
    'decision_reason', '대체 시도',
    'status', 'confirmed',
    'confirmed_at', '2026-08-20T10:00:00Z'::timestamptz,
    'confirmed_by', '95000000-0000-0000-0000-000000000001'::uuid,
    'created_at', '2026-08-20T10:00:00Z'::timestamptz,
    'updated_at', '2026-08-20T10:00:00Z'::timestamptz
  ),
  'the transitioned Legacy edge preserves all 12 lineage semantic fields'
);

select is(
  (
    select predecessor_item_id::text
      || '>'
      || successor_item_id::text
      || '|'
      || decision_reason
      || '|'
      || updated_at::text
    from public.closet_replacement_line_edges
    where id = '55100000-0000-0000-0000-000000000001'
  ),
  '51200000-0000-0000-0000-000000000001>51300000-0000-0000-0000-000000000001|온도 세분화|2026-08-20 11:00:00+00',
  'the pre-existing manual edge remains unchanged'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"95000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.reverse_closet_replacement_line_edge(
      '51000000-0000-0000-0000-000000000001',
      '55000000-0000-0000-0000-000000000001',
      '2026-08-20T10:00:00Z'
    )
  $$,
  'a transitioned edge reverses without a Legacy source table'
);

select is(
  (
    select predecessor_item_id::text || '>' || successor_item_id::text
    from public.closet_replacement_line_edges
    where id = '55000000-0000-0000-0000-000000000001'
  ),
  '51200000-0000-0000-0000-000000000001>51100000-0000-0000-0000-000000000001',
  'the direct reverse RPC swaps the edge direction'
);

select throws_ok(
  $$
    select public.reverse_closet_replacement_line_edge(
      '51000000-0000-0000-0000-000000000001',
      '55000000-0000-0000-0000-000000000001',
      '2026-08-20T10:00:00Z'
    )
  $$,
  '40001',
  'the replacement line edge changed after it was loaded',
  'the simplified reverse RPC keeps optimistic concurrency protection'
);

select lives_ok(
  $$
    select public.update_closet_replacement_line_edge_connection(
      '51000000-0000-0000-0000-000000000001',
      '55100000-0000-0000-0000-000000000001',
      '2026-08-20T11:00:00Z',
      '51100000-0000-0000-0000-000000000001',
      'Edited branch',
      '기능 세분화'
    )
  $$,
  'connection editing works without the removed source columns'
);

select is(
  (
    select predecessor_item_id::text || '|' || branch_name || '|' || decision_reason
    from public.closet_replacement_line_edges
    where id = '55100000-0000-0000-0000-000000000001'
  ),
  '51100000-0000-0000-0000-000000000001|Edited branch|기능 세분화',
  'connection editing preserves the current edge-only contract'
);

select lives_ok(
  $$
    select public.create_closet_replacement_manual_edge(
      '51000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      '51300000-0000-0000-0000-000000000001',
      '51400000-0000-0000-0000-000000000001',
      null,
      '대체 시도'
    )
  $$,
  'manual edge creation works with the edge-only row shape'
);

select throws_ok(
  $$
    select public.create_closet_replacement_manual_edge(
      '51000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      '51400000-0000-0000-0000-000000000001',
      '51200000-0000-0000-0000-000000000001',
      null,
      '대체 시도'
    )
  $$,
  '23514',
  'replacement lineage edges must remain acyclic',
  'the simplified validator still rejects a lineage cycle'
);

select lives_ok(
  $$
    select public.set_closet_replacement_line_start(
      '51000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      '51500000-0000-0000-0000-000000000001',
      true
    )
  $$,
  'an unrelated explicit start can still be designated'
);

select throws_ok(
  $$
    select public.create_closet_replacement_manual_edge(
      '51000000-0000-0000-0000-000000000001',
      '52000000-0000-0000-0000-000000000001',
      '51400000-0000-0000-0000-000000000001',
      '51500000-0000-0000-0000-000000000001',
      null,
      '대체 시도'
    )
  $$,
  '23514',
  'an explicit start item cannot have an incoming edge',
  'the simplified validator still protects explicit starts'
);

select lives_ok(
  $$
    select public.disconnect_closet_replacement_line_edge(
      '51000000-0000-0000-0000-000000000001',
      edge.id,
      edge.updated_at
    )
    from public.closet_replacement_line_edges edge
    where edge.predecessor_item_id = '51300000-0000-0000-0000-000000000001'
      and edge.successor_item_id = '51400000-0000-0000-0000-000000000001'
  $$,
  'a newly created edge can still be disconnected'
);

select ok(
  exists (
    select 1
    from public.closet_replacement_line_starts start
    where start.workspace_id = '51000000-0000-0000-0000-000000000001'
      and start.replacement_line_id = '52000000-0000-0000-0000-000000000001'
      and start.item_id = '51400000-0000-0000-0000-000000000001'
  ),
  'disconnect still promotes an orphaned successor to an explicit start'
);

select * from finish();
rollback;
