begin;

select plan(37);

select has_table(
  'public',
  'closet_replacement_line_edges',
  'directed Replacement Line edges have a canonical table'
);

select has_column(
  'public',
  'closet_replacement_line_edges',
  'predecessor_item_id',
  'an edge preserves its predecessor'
);

select has_column(
  'public',
  'closet_replacement_line_edges',
  'status',
  'an edge can return to needs_review'
);

select ok(
  (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.closet_replacement_line_edges'::regclass
  ),
  'RLS is enabled on directed edges'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.closet_replacement_line_edges'::regclass
      and conname = 'closet_replacement_line_edges_not_self'
  ),
  'self-edges are rejected'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.closet_replacement_line_edges'::regclass
      and conname = 'closet_replacement_line_edges_source_unique'
  ),
  'one Legacy Link has at most one directed edge'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.closet_replacement_line_edges'::regclass
      and conname = 'closet_replacement_line_edges_predecessor_membership_fkey'
  ),
  'the predecessor must belong to the selected Line and workspace'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.closet_replacement_line_edges'::regclass
      and conname = 'closet_replacement_line_edges_successor_membership_fkey'
  ),
  'the successor must belong to the selected Line and workspace'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.closet_replacement_line_edges'::regclass
      and conname = 'closet_replacement_line_edges_source_owner_fkey'
  ),
  'the source Legacy Link must belong to the same workspace'
);

select has_index(
  'public',
  'closet_replacement_line_edges',
  'closet_replacement_line_edges_workspace_line_status_idx',
  'Line graph reads have a composite index'
);

select has_index(
  'public',
  'closet_replacement_line_edges',
  'closet_replacement_line_edges_predecessor_idx',
  'predecessor traversal has an index'
);

select has_index(
  'public',
  'closet_replacement_line_edges',
  'closet_replacement_line_edges_successor_idx',
  'successor traversal has an index'
);

select has_index(
  'public',
  'closet_replacement_line_edges',
  'closet_replacement_line_edges_source_workspace_fk_idx',
  'the source Legacy Link workspace foreign key has a covering index'
);

select ok(
  has_table_privilege('authenticated', 'public.closet_replacement_line_edges', 'select'),
  'authenticated members can read directed edges'
);

select ok(
  not has_table_privilege('authenticated', 'public.closet_replacement_line_edges', 'insert'),
  'authenticated clients cannot directly insert edges'
);

select ok(
  not has_table_privilege('authenticated', 'public.closet_replacement_line_edges', 'update'),
  'authenticated clients cannot directly update edges'
);

select ok(
  not has_table_privilege('authenticated', 'public.closet_replacement_line_edges', 'delete'),
  'authenticated clients cannot directly delete edges'
);

select has_function(
  'public',
  'confirm_closet_replacement_line_edge',
  array['uuid', 'uuid', 'uuid', 'timestamp with time zone', 'text', 'text'],
  'the atomic edge confirmation RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.confirm_closet_replacement_line_edge(uuid,uuid,uuid,timestamptz,text,text)',
    'execute'
  ),
  'authenticated members can use the edge confirmation RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.confirm_closet_replacement_line_edge(uuid,uuid,uuid,timestamptz,text,text)',
    'execute'
  ),
  'anonymous users cannot confirm edges'
);

select has_function(
  'public',
  'confirm_closet_replacement_line_edges',
  array['uuid', 'jsonb'],
  'the atomic batch edge confirmation RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.confirm_closet_replacement_line_edges(uuid,jsonb)',
    'execute'
  ),
  'authenticated members can use the batch edge confirmation RPC'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.confirm_closet_replacement_line_edges(uuid,jsonb)',
    'execute'
  ),
  'anonymous users cannot batch-confirm edges'
);

insert into auth.users (id, email)
values ('90000000-0000-0000-0000-000000000001', 'phase4-edge-owner@example.test');

insert into public.workspaces (id, name)
values ('10000000-0000-0000-0000-000000000001', 'Phase 4 edge workspace');

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '10000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000001',
  'admin'
);

insert into public.closet_items (id, workspace_id, name, category, display_hex)
values
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Item A', 'Top', '#111111'),
  ('12000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Item B', 'Top', '#222222'),
  ('13000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Item C', 'Top', '#333333'),
  ('14000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Item D', 'Top', '#444444');

insert into public.closet_replacement_lines (id, workspace_id, name)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Main Line'),
  ('21000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Incomplete Line');

insert into public.closet_replacement_line_items (workspace_id, replacement_line_id, item_id)
values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001');

insert into public.closet_replacement_legacy_links (
  id,
  workspace_id,
  item_a_id,
  item_b_id,
  source_item_a_notion_page_id,
  source_item_b_notion_page_id,
  review_status,
  review_decision,
  review_reason,
  reviewed_at,
  reviewed_by
)
values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'reviewed', 'a_to_b', 'A to B', now(), '90000000-0000-0000-0000-000000000001'),
  ('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'reviewed', 'a_to_b', 'B to C', now(), '90000000-0000-0000-0000-000000000001'),
  ('32000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', 'reviewed', 'b_to_a', 'C to A', now(), '90000000-0000-0000-0000-000000000001'),
  ('33000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'reviewed', 'a_to_b', 'A to D', now(), '90000000-0000-0000-0000-000000000001'),
  ('30500000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', '13000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', 'reviewed', 'a_to_b', 'C to D', now(), '90000000-0000-0000-0000-000000000001'),
  ('30600000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', '14000000-0000-0000-0000-000000000001', '12000000-0000-0000-0000-000000000001', 'reviewed', 'a_to_b', 'D to B', now(), '90000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"90000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select lives_ok(
  $$
    select public.confirm_closet_replacement_line_edge(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      (select updated_at from public.closet_replacement_legacy_links where id = '30000000-0000-0000-0000-000000000001'),
      null,
      'A was replaced by B'
    )
  $$,
  'a reviewed directional link can become an edge'
);

select is(
  (
    select predecessor_item_id::text || '>' || successor_item_id::text
    from public.closet_replacement_line_edges
    where source_legacy_link_id = '30000000-0000-0000-0000-000000000001'
  ),
  '11000000-0000-0000-0000-000000000001>12000000-0000-0000-0000-000000000001',
  'the RPC derives direction from the human review'
);

select lives_ok(
  $$
    select public.confirm_closet_replacement_line_edge(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '31000000-0000-0000-0000-000000000001',
      (select updated_at from public.closet_replacement_legacy_links where id = '31000000-0000-0000-0000-000000000001'),
      null,
      'B was replaced by C'
    )
  $$,
  'a second acyclic edge is accepted'
);

select throws_ok(
  $$
    select public.confirm_closet_replacement_line_edge(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      (select updated_at from public.closet_replacement_legacy_links where id = '32000000-0000-0000-0000-000000000001'),
      null,
      'This would close C to A'
    )
  $$,
  '23514',
  'replacement lineage edges must remain acyclic',
  'an edge that closes a cycle is rejected atomically'
);

select throws_ok(
  $$
    select public.confirm_closet_replacement_line_edge(
      '10000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000001',
      '33000000-0000-0000-0000-000000000001',
      (select updated_at from public.closet_replacement_legacy_links where id = '33000000-0000-0000-0000-000000000001'),
      null,
      'D is not in this Line'
    )
  $$,
  '23503',
  null,
  'both edge Items must belong to the selected Line'
);

select throws_ok(
  $$
    select public.confirm_closet_replacement_line_edge(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      '2000-01-01T00:00:00Z'::timestamptz,
      null,
      'Stale attempt'
    )
  $$,
  '40001',
  'the legacy link changed after it was loaded',
  'a stale candidate cannot be confirmed'
);

select lives_ok(
  $$
    select public.revise_closet_replacement_legacy_link(
      '10000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      (select updated_at from public.closet_replacement_legacy_links where id = '30000000-0000-0000-0000-000000000001'),
      'b_to_a',
      'The direction was corrected'
    )
  $$,
  'a source review remains editable after edge confirmation'
);

select is(
  (
    select status
    from public.closet_replacement_line_edges
    where source_legacy_link_id = '30000000-0000-0000-0000-000000000001'
  ),
  'needs_review',
  'changing the source review invalidates its confirmed edge'
);

select lives_ok(
  $$
    select public.confirm_closet_replacement_line_edge(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      (select updated_at from public.closet_replacement_legacy_links where id = '30000000-0000-0000-0000-000000000001'),
      null,
      'The corrected direction is confirmed'
    )
  $$,
  'a needs_review edge can be confirmed again'
);

select is(
  (
    select predecessor_item_id::text || '>' || successor_item_id::text
    from public.closet_replacement_line_edges
    where source_legacy_link_id = '30000000-0000-0000-0000-000000000001'
  ),
  '12000000-0000-0000-0000-000000000001>11000000-0000-0000-0000-000000000001',
  'reconfirmation follows the revised direction'
);

select throws_ok(
  $$
    select public.confirm_closet_replacement_line_edge(
      '10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      (select updated_at from public.closet_replacement_legacy_links where id = '30000000-0000-0000-0000-000000000001'),
      null,
      'Duplicate confirmation'
    )
  $$,
  '22023',
  'the legacy link already has a confirmed edge',
  'a confirmed source cannot be duplicated'
);

select throws_ok(
  $$
    select * from public.confirm_closet_replacement_line_edges(
      '10000000-0000-0000-0000-000000000001',
      jsonb_build_array(
        jsonb_build_object(
          'replacement_line_id', '20000000-0000-0000-0000-000000000001',
          'source_legacy_link_id', '30500000-0000-0000-0000-000000000001',
          'expected_legacy_updated_at', (
            select updated_at from public.closet_replacement_legacy_links
            where id = '30500000-0000-0000-0000-000000000001'
          ),
          'branch_name', null,
          'decision_reason', 'C was replaced by D'
        ),
        jsonb_build_object(
          'replacement_line_id', '20000000-0000-0000-0000-000000000001',
          'source_legacy_link_id', '30600000-0000-0000-0000-000000000001',
          'expected_legacy_updated_at', (
            select updated_at from public.closet_replacement_legacy_links
            where id = '30600000-0000-0000-0000-000000000001'
          ),
          'branch_name', null,
          'decision_reason', 'D to B would close the cycle'
        )
      )
    )
  $$,
  '23514',
  'replacement lineage edges must remain acyclic',
  'one invalid candidate rejects the entire batch'
);

select is(
  (select count(*)::integer from public.closet_replacement_line_edges),
  2,
  'the valid candidate before a failing candidate is rolled back too'
);

select is(
  (select count(*)::integer from public.closet_replacement_line_edges),
  2,
  'the member sees only the two accepted edges'
);

select * from finish();
rollback;
