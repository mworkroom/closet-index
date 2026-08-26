begin;

select plan(39);

select has_table(
  'public',
  'closet_replacement_legacy_links',
  'the emergency rollback recreates the Legacy Link table'
);

select has_table(
  'public',
  'closet_replacement_legacy_link_revisions',
  'the emergency rollback recreates the Legacy revision table'
);

select has_column(
  'public',
  'closet_replacement_line_edges',
  'source_legacy_link_id',
  'the emergency rollback restores the source foreign-key column'
);

select has_column(
  'public',
  'closet_replacement_line_edges',
  'source_kind',
  'the emergency rollback restores the source discriminator'
);

select is(
  (
    select pg_get_expr(default_row.adbin, default_row.adrelid)
    from pg_catalog.pg_attrdef default_row
    join pg_catalog.pg_attribute attribute
      on attribute.attrelid = default_row.adrelid
     and attribute.attnum = default_row.adnum
    where default_row.adrelid =
      'public.closet_replacement_line_edges'::regclass
      and attribute.attname = 'source_kind'
  ),
  '''legacy_link''::text',
  'the historic source_kind default is restored after existing rows initialize'
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
  4,
  'all four Legacy source constraints are restored'
);

select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid =
      'public.closet_replacement_line_edges'::regclass
      and constraint_row.conname =
        'closet_replacement_line_edges_source_owner_fkey'
      and constraint_row.confrelid =
        'public.closet_replacement_legacy_links'::regclass
      and constraint_row.confdeltype = 'r'
  ),
  'the restored source owner foreign key remains restrictive'
);

select has_index(
  'public',
  'closet_replacement_line_edges',
  'closet_replacement_line_edges_source_workspace_fk_idx',
  'the source owner foreign key regains its covering index'
);

select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid = 'public.closet_replacement_legacy_links'::regclass
  ),
  'RLS is restored on Legacy Links'
);

select ok(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class relation
    where relation.oid =
      'public.closet_replacement_legacy_link_revisions'::regclass
  ),
  'RLS is restored on Legacy revisions'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = any(array[
        'closet_replacement_legacy_links',
        'closet_replacement_legacy_link_revisions'
      ])
      and policy.cmd = 'SELECT'
      and policy.roles = array['authenticated']::name[]
      and policy.qual like '%private.is_workspace_member%'
  ),
  2,
  'both restored tables use authenticated workspace-member read policies'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.closet_replacement_legacy_links'::regclass,
      'public.closet_replacement_legacy_link_revisions'::regclass
    ]) relation_oid
    where has_table_privilege('authenticated', relation_oid, 'select')
  ),
  2,
  'authenticated members regain read access to both restored tables'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.closet_replacement_legacy_links'::regclass,
      'public.closet_replacement_legacy_link_revisions'::regclass
    ]) relation_oid
    where has_table_privilege('authenticated', relation_oid, 'insert')
  ),
  0,
  'authenticated clients do not gain direct Legacy insert access'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.closet_replacement_legacy_links'::regclass,
      'public.closet_replacement_legacy_link_revisions'::regclass
    ]) relation_oid
    where has_table_privilege('service_role', relation_oid, 'insert')
  ),
  2,
  'service_role regains controlled restore insert access'
);

select has_function(
  'public',
  'review_closet_replacement_legacy_link',
  array['uuid', 'uuid', 'text', 'text'],
  'the initial Legacy review RPC is restored'
);

select has_function(
  'public',
  'revise_closet_replacement_legacy_link',
  array['uuid', 'uuid', 'timestamp with time zone', 'text', 'text'],
  'the Legacy revision RPC is restored'
);

select has_function(
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
  'the singular Legacy edge confirmation RPC is restored'
);

select has_function(
  'public',
  'confirm_closet_replacement_line_edges',
  array['uuid', 'jsonb'],
  'the batch Legacy edge confirmation RPC is restored'
);

select has_function(
  'private',
  'mark_legacy_link_edge_needs_review',
  array[]::text[],
  'the Legacy invalidation trigger helper is restored'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_trigger trigger
    where trigger.tgrelid =
      'public.closet_replacement_legacy_links'::regclass
      and trigger.tgname = 'mark_legacy_link_edge_needs_review'
      and not trigger.tgisinternal
  ),
  1,
  'the Legacy invalidation trigger is restored once'
);

select ok(
  pg_get_triggerdef(
    (
      select trigger.oid
      from pg_catalog.pg_trigger trigger
      where trigger.tgrelid =
        'public.closet_replacement_line_edges'::regclass
        and trigger.tgname = 'validate_closet_replacement_line_edge'
        and not trigger.tgisinternal
    ),
    true
  ) like '%source_legacy_link_id%'
  and pg_get_triggerdef(
    (
      select trigger.oid
      from pg_catalog.pg_trigger trigger
      where trigger.tgrelid =
        'public.closet_replacement_line_edges'::regclass
        and trigger.tgname = 'validate_closet_replacement_line_edge'
        and not trigger.tgisinternal
    ),
    true
  ) like '%source_kind%',
  'the restored edge validator trigger watches both source columns'
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
      and pg_get_functiondef(procedure.oid) ~
        'closet_replacement_legacy|source_legacy_link_id|source_kind'
  ),
  4,
  'the four restored source-aware functions reference the Legacy contract'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    where procedure.oid = any(array[
      'private.validate_closet_replacement_line_edge()'::regprocedure,
      'private.mark_legacy_link_edge_needs_review()'::regprocedure,
      'public.review_closet_replacement_legacy_link(uuid,uuid,text,text)'::regprocedure,
      'public.revise_closet_replacement_legacy_link(uuid,uuid,timestamptz,text,text)'::regprocedure,
      'public.confirm_closet_replacement_line_edge(uuid,uuid,uuid,timestamptz,text,text)'::regprocedure,
      'public.confirm_closet_replacement_line_edges(uuid,jsonb)'::regprocedure,
      'public.create_closet_replacement_manual_edge(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure,
      'public.reverse_closet_replacement_line_edge(uuid,uuid,timestamptz)'::regprocedure
    ])
      and procedure.prosecdef
  ),
  9,
  'all restored mutation and trigger functions are security definers'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_proc procedure
    where procedure.oid = any(array[
      'private.validate_closet_replacement_line_edge()'::regprocedure,
      'private.mark_legacy_link_edge_needs_review()'::regprocedure,
      'public.review_closet_replacement_legacy_link(uuid,uuid,text,text)'::regprocedure,
      'public.revise_closet_replacement_legacy_link(uuid,uuid,timestamptz,text,text)'::regprocedure,
      'public.confirm_closet_replacement_line_edge(uuid,uuid,uuid,timestamptz,text,text)'::regprocedure,
      'public.confirm_closet_replacement_line_edges(uuid,jsonb)'::regprocedure,
      'public.create_closet_replacement_manual_edge(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure,
      'public.reverse_closet_replacement_line_edge(uuid,uuid,timestamptz)'::regprocedure
    ])
      and procedure.proconfig = array['search_path=""']
  ),
  9,
  'all restored mutation and trigger functions pin an empty search_path'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.review_closet_replacement_legacy_link(uuid,uuid,text,text)'::regprocedure,
      'public.revise_closet_replacement_legacy_link(uuid,uuid,timestamptz,text,text)'::regprocedure,
      'public.confirm_closet_replacement_line_edge(uuid,uuid,uuid,timestamptz,text,text)'::regprocedure,
      'public.confirm_closet_replacement_line_edges(uuid,jsonb)'::regprocedure,
      'public.create_closet_replacement_manual_edge(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure,
      'public.reverse_closet_replacement_line_edge(uuid,uuid,timestamptz)'::regprocedure
    ]) procedure_oid
    where has_function_privilege('authenticated', procedure_oid, 'execute')
  ),
  7,
  'authenticated members regain execute access to the restored public RPCs'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.review_closet_replacement_legacy_link(uuid,uuid,text,text)'::regprocedure,
      'public.revise_closet_replacement_legacy_link(uuid,uuid,timestamptz,text,text)'::regprocedure,
      'public.confirm_closet_replacement_line_edge(uuid,uuid,uuid,timestamptz,text,text)'::regprocedure,
      'public.confirm_closet_replacement_line_edges(uuid,jsonb)'::regprocedure,
      'public.create_closet_replacement_manual_edge(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure,
      'public.reverse_closet_replacement_line_edge(uuid,uuid,timestamptz)'::regprocedure
    ]) procedure_oid
    where has_function_privilege('service_role', procedure_oid, 'execute')
  ),
  7,
  'service_role regains execute access to the restored public RPCs'
);

select is(
  (
    select count(*)::integer
    from unnest(array[
      'public.review_closet_replacement_legacy_link(uuid,uuid,text,text)'::regprocedure,
      'public.revise_closet_replacement_legacy_link(uuid,uuid,timestamptz,text,text)'::regprocedure,
      'public.confirm_closet_replacement_line_edge(uuid,uuid,uuid,timestamptz,text,text)'::regprocedure,
      'public.confirm_closet_replacement_line_edges(uuid,jsonb)'::regprocedure,
      'public.create_closet_replacement_manual_edge(uuid,uuid,uuid,uuid,text,text)'::regprocedure,
      'public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure,
      'public.reverse_closet_replacement_line_edge(uuid,uuid,timestamptz)'::regprocedure
    ]) procedure_oid
    where has_function_privilege('anon', procedure_oid, 'execute')
  ),
  0,
  'anonymous users cannot execute restored mutation RPCs'
);

select ok(
  obj_description(
    'public.closet_replacement_legacy_links'::regclass,
    'pg_class'
  ) like '%LEGACY_DROP_CANDIDATE%'
  and obj_description(
    'public.closet_replacement_legacy_link_revisions'::regclass,
    'pg_class'
  ) like '%LEGACY_DROP_CANDIDATE%',
  'the rollback restores lifecycle comments on both Legacy tables'
);

select is(
  (
    select count(*)::integer
    from public.closet_replacement_line_edges
    where workspace_id = '51000000-0000-0000-0000-000000000001'
      and source_kind = 'manual'
      and source_legacy_link_id is null
  ),
  2,
  'existing post-cleanup edges initialize safely as manual rows'
);

select is(
  (select count(*)::integer from public.closet_replacement_legacy_links),
  0,
  'the schema rollback does not silently recreate production Link rows'
);

select is(
  (
    select count(*)::integer
    from public.closet_replacement_legacy_link_revisions
  ),
  0,
  'the schema rollback leaves revision data restoration explicit'
);

select lives_ok(
  $$
    insert into public.closet_replacement_legacy_links (
      id,
      workspace_id,
      item_a_id,
      item_b_id,
      source,
      source_item_a_notion_page_id,
      source_item_b_notion_page_id,
      review_status,
      review_decision,
      review_reason,
      reviewed_at,
      reviewed_by,
      created_at,
      updated_at
    )
    values (
      '53000000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001',
      '51100000-0000-0000-0000-000000000001',
      '51200000-0000-0000-0000-000000000001',
      'notion_replaces',
      '61100000-0000-0000-0000-000000000001',
      '61200000-0000-0000-0000-000000000001',
      'reviewed',
      'a_to_b',
      'Synthetic reviewed direction',
      '2026-08-20T09:00:00Z',
      '95000000-0000-0000-0000-000000000001',
      '2026-08-20T08:00:00Z',
      '2026-08-20T09:00:00Z'
    )
  $$,
  'a Link row from the separate data export can be restored'
);

select lives_ok(
  $$
    insert into public.closet_replacement_legacy_link_revisions (
      id,
      workspace_id,
      legacy_link_id,
      revision_number,
      decision,
      reason,
      reviewed_at,
      reviewed_by,
      created_at
    )
    values (
      '54000000-0000-0000-0000-000000000001',
      '51000000-0000-0000-0000-000000000001',
      '53000000-0000-0000-0000-000000000001',
      1,
      'a_to_b',
      'Synthetic reviewed direction',
      '2026-08-20T09:00:00Z',
      '95000000-0000-0000-0000-000000000001',
      '2026-08-20T09:00:00Z'
    )
  $$,
  'a revision row from the separate data export can be restored'
);

select lives_ok(
  $$
    update public.closet_replacement_line_edges
    set
      source_legacy_link_id = '53000000-0000-0000-0000-000000000001',
      source_kind = 'legacy_link'
    where id = '55000000-0000-0000-0000-000000000001'
      and workspace_id = '51000000-0000-0000-0000-000000000001'
  $$,
  'an exported source association can be reattached after its Link exists'
);

select is(
  (
    select source_kind || '|' || source_legacy_link_id::text
    from public.closet_replacement_line_edges
    where id = '55000000-0000-0000-0000-000000000001'
  ),
  'legacy_link|53000000-0000-0000-0000-000000000001',
  'the restored source association satisfies the old source contract'
);

select throws_ok(
  $$
    update public.closet_replacement_line_edges
    set
      predecessor_item_id = '51200000-0000-0000-0000-000000000001',
      successor_item_id = '51100000-0000-0000-0000-000000000001'
    where id = '55000000-0000-0000-0000-000000000001'
  $$,
  '23514',
  'edge direction must match its reviewed legacy link',
  'the restored validator rejects a direction that disagrees with its Link'
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
  'the restored Legacy-aware reverse transaction remains executable'
);

select is(
  (
    select edge.predecessor_item_id::text
      || '>'
      || edge.successor_item_id::text
      || '|'
      || edge.status
      || '|'
      || link.review_decision
    from public.closet_replacement_line_edges edge
    join public.closet_replacement_legacy_links link
      on link.id = edge.source_legacy_link_id
     and link.workspace_id = edge.workspace_id
    where edge.id = '55000000-0000-0000-0000-000000000001'
  ),
  '51200000-0000-0000-0000-000000000001>51100000-0000-0000-0000-000000000001|confirmed|b_to_a',
  'the restored reverse transaction synchronizes Link and edge direction'
);

select is(
  (
    select count(*)::integer
    from public.closet_replacement_legacy_link_revisions
    where legacy_link_id = '53000000-0000-0000-0000-000000000001'
  ),
  2,
  'the restored reverse transaction appends the next Legacy revision'
);

select * from finish();
rollback;
