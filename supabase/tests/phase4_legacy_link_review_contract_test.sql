begin;

select plan(27);

select has_table(
  'public',
  'closet_replacement_legacy_links',
  'the canonical Legacy Link table exists'
);

select has_column(
  'public',
  'closet_replacement_legacy_links',
  'review_status',
  'Legacy Links preserve review progress'
);

select has_column(
  'public',
  'closet_replacement_legacy_links',
  'review_decision',
  'Legacy Links preserve the selected review result'
);

select ok(
  (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.closet_replacement_legacy_links'::regclass
  ),
  'RLS is enabled on Legacy Links'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_replacement_legacy_links'::regclass
      and conname = 'closet_replacement_legacy_links_pair_order'
  ),
  'the unordered pair has one canonical A/B order'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_replacement_legacy_links'::regclass
      and conname = 'closet_replacement_legacy_links_workspace_pair_unique'
  ),
  'a workspace cannot store the same unordered pair twice'
);

select has_index(
  'public',
  'closet_replacement_legacy_links',
  'closet_replacement_legacy_links_item_a_workspace_fk_idx',
  'Item A workspace foreign key has a covering index'
);

select has_index(
  'public',
  'closet_replacement_legacy_links',
  'closet_replacement_legacy_links_item_b_workspace_fk_idx',
  'Item B workspace foreign key has a covering index'
);

select has_index(
  'public',
  'closet_replacement_legacy_links',
  'closet_replacement_legacy_links_reviewed_by_fk_idx',
  'reviewed_by foreign key has a covering index'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'closet_replacement_legacy_links'
      and policyname = 'closet_replacement_legacy_links_select_member'
      and cmd = 'SELECT'
      and qual like '%is_workspace_member%'
  ),
  'Legacy Link reads require workspace membership'
);

select ok(
  has_table_privilege(
    'authenticated',
    'public.closet_replacement_legacy_links',
    'select'
  ),
  'authenticated members can read review rows'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.closet_replacement_legacy_links',
    'insert'
  ),
  'authenticated clients cannot import Legacy Links'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.closet_replacement_legacy_links',
    'update'
  ),
  'authenticated clients cannot directly alter review rows'
);

select has_function(
  'public',
  'review_closet_replacement_legacy_link',
  array['uuid', 'uuid', 'text', 'text'],
  'the confirm-only Legacy Link review RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.review_closet_replacement_legacy_link(uuid,uuid,text,text)',
    'execute'
  ),
  'authenticated users can confirm a review'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.review_closet_replacement_legacy_link(uuid,uuid,text,text)',
    'execute'
  ),
  'anonymous users cannot confirm a review'
);

insert into auth.users (id, email)
values
  ('81000000-0000-0000-0000-000000000001', 'phase4-owner@example.test'),
  ('82000000-0000-0000-0000-000000000002', 'phase4-other@example.test');

insert into public.workspaces (id, name)
values
  ('83000000-0000-0000-0000-000000000001', 'Phase 4 workspace A'),
  ('83000000-0000-0000-0000-000000000002', 'Phase 4 workspace B');

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

insert into public.closet_items (
  id,
  workspace_id,
  name,
  category,
  display_hex
)
values
  (
    '84000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001',
    'Workspace A Item A',
    'Top',
    '#111111'
  ),
  (
    '85000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001',
    'Workspace A Item B',
    'Top',
    '#222222'
  ),
  (
    '86000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000002',
    'Workspace B Item A',
    'Top',
    '#333333'
  ),
  (
    '87000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000002',
    'Workspace B Item B',
    'Top',
    '#444444'
  );

insert into public.closet_replacement_legacy_links (
  id,
  workspace_id,
  item_a_id,
  item_b_id,
  source_item_a_notion_page_id,
  source_item_b_notion_page_id
)
values
  (
    '88000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000001'
  ),
  (
    '89000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000002',
    '86000000-0000-0000-0000-000000000001',
    '87000000-0000-0000-0000-000000000001',
    '86000000-0000-0000-0000-000000000001',
    '87000000-0000-0000-0000-000000000001'
  );

select throws_ok(
  $$
    insert into public.closet_replacement_legacy_links (
      workspace_id,
      item_a_id,
      item_b_id,
      source_item_a_notion_page_id,
      source_item_b_notion_page_id
    )
    values (
      '83000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000001',
      '84000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000001',
      '84000000-0000-0000-0000-000000000001'
    )
  $$,
  '23514',
  null,
  'a reversed pair is rejected instead of stored twice'
);

select throws_ok(
  $$
    insert into public.closet_replacement_legacy_links (
      workspace_id,
      item_a_id,
      item_b_id,
      source_item_a_notion_page_id,
      source_item_b_notion_page_id
    )
    values (
      '83000000-0000-0000-0000-000000000001',
      '84000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000001',
      '84000000-0000-0000-0000-000000000001',
      '85000000-0000-0000-0000-000000000001'
    )
  $$,
  '23505',
  null,
  'the same canonical pair cannot be imported twice'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (
    select count(*)::integer
    from public.closet_replacement_legacy_links
  ),
  1,
  'a member sees only the Legacy Links in their workspace'
);

select throws_ok(
  $$
    select public.review_closet_replacement_legacy_link(
      '83000000-0000-0000-0000-000000000001',
      '88000000-0000-0000-0000-000000000001',
      'a_to_b',
      '   '
    )
  $$,
  '22023',
  'a review reason is required',
  'blank review reasons are rejected'
);

select throws_ok(
  $$
    select public.review_closet_replacement_legacy_link(
      '83000000-0000-0000-0000-000000000001',
      '88000000-0000-0000-0000-000000000001',
      'newest_wins',
      'Not a valid choice'
    )
  $$,
  '22023',
  'a valid legacy link decision is required',
  'unknown review decisions are rejected'
);

select throws_ok(
  $$
    select public.review_closet_replacement_legacy_link(
      '83000000-0000-0000-0000-000000000002',
      '89000000-0000-0000-0000-000000000001',
      'parallel',
      'Other workspace'
    )
  $$,
  '42501',
  'workspace membership is required',
  'a member cannot review another workspace pair'
);

select lives_ok(
  $$
    select public.review_closet_replacement_legacy_link(
      '83000000-0000-0000-0000-000000000001',
      '88000000-0000-0000-0000-000000000001',
      'a_to_b',
      'A was replaced by B'
    )
  $$,
  'a member can confirm one pending review'
);

select is(
  (
    select review_status
    from public.closet_replacement_legacy_links
    where id = '88000000-0000-0000-0000-000000000001'
  ),
  'reviewed',
  'the confirmed pair is marked reviewed'
);

select is(
  (
    select review_decision
    from public.closet_replacement_legacy_links
    where id = '88000000-0000-0000-0000-000000000001'
  ),
  'a_to_b',
  'the selected direction is preserved without creating an edge'
);

select is(
  (
    select review_reason
    from public.closet_replacement_legacy_links
    where id = '88000000-0000-0000-0000-000000000001'
  ),
  'A was replaced by B',
  'the human review reason is preserved'
);

select throws_ok(
  $$
    select public.review_closet_replacement_legacy_link(
      '83000000-0000-0000-0000-000000000001',
      '88000000-0000-0000-0000-000000000001',
      'b_to_a',
      'Attempt to overwrite'
    )
  $$,
  'P0002',
  'pending legacy link was not found',
  'a reviewed pair cannot be overwritten through the confirm RPC'
);

select * from finish();
rollback;
