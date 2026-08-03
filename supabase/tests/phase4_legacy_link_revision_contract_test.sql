begin;

select plan(27);

select has_table(
  'public',
  'closet_replacement_legacy_link_revisions',
  'Legacy Link review history has a canonical table'
);

select has_column(
  'public',
  'closet_replacement_legacy_link_revisions',
  'revision_number',
  'review history preserves an ordered revision number'
);

select has_column(
  'public',
  'closet_replacement_legacy_link_revisions',
  'decision',
  'review history preserves each human decision'
);

select ok(
  (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.closet_replacement_legacy_link_revisions'::regclass
  ),
  'RLS is enabled on Legacy Link review history'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_replacement_legacy_link_revisions'::regclass
      and conname = 'closet_replacement_legacy_link_revisions_link_revision_unique'
  ),
  'one Legacy Link cannot repeat a revision number'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_replacement_legacy_link_revisions'::regclass
      and conname = 'closet_replacement_legacy_link_revisions_link_owner_fkey'
  ),
  'review history belongs to the same workspace as its Legacy Link'
);

select has_index(
  'public',
  'closet_replacement_legacy_link_revisions',
  'closet_replacement_legacy_link_revisions_link_workspace_fk_idx',
  'the Legacy Link workspace foreign key has a covering index'
);

select has_index(
  'public',
  'closet_replacement_legacy_link_revisions',
  'closet_replacement_legacy_link_revisions_reviewed_by_fk_idx',
  'the reviewer foreign key has a covering index'
);

select has_index(
  'public',
  'closet_replacement_legacy_link_revisions',
  'closet_replacement_legacy_link_revisions_workspace_created_idx',
  'workspace history reads have a composite index'
);

select ok(
  has_table_privilege(
    'authenticated',
    'public.closet_replacement_legacy_link_revisions',
    'select'
  ),
  'authenticated members can read review history'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.closet_replacement_legacy_link_revisions',
    'insert'
  ),
  'authenticated clients cannot directly append review history'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.closet_replacement_legacy_link_revisions',
    'update'
  ),
  'authenticated clients cannot rewrite review history'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.closet_replacement_legacy_link_revisions',
    'delete'
  ),
  'authenticated clients cannot delete review history'
);

select has_function(
  'public',
  'revise_closet_replacement_legacy_link',
  array['uuid', 'uuid', 'timestamp with time zone', 'text', 'text'],
  'the revision RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.revise_closet_replacement_legacy_link(uuid,uuid,timestamptz,text,text)',
    'execute'
  ),
  'authenticated users can revise a review'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.revise_closet_replacement_legacy_link(uuid,uuid,timestamptz,text,text)',
    'execute'
  ),
  'anonymous users cannot revise a review'
);

insert into auth.users (id, email)
values
  ('91000000-0000-0000-0000-000000000001', 'phase4-revision-owner@example.test'),
  ('92000000-0000-0000-0000-000000000002', 'phase4-revision-other@example.test');

insert into public.workspaces (id, name)
values
  ('93000000-0000-0000-0000-000000000001', 'Phase 4 revision workspace A'),
  ('93000000-0000-0000-0000-000000000002', 'Phase 4 revision workspace B');

insert into public.workspace_members (workspace_id, user_id, role)
values
  ('93000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001', 'admin'),
  ('93000000-0000-0000-0000-000000000002', '92000000-0000-0000-0000-000000000002', 'admin');

insert into public.closet_items (id, workspace_id, name, category, display_hex)
values
  ('94000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'A Item A', 'Top', '#111111'),
  ('95000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000001', 'A Item B', 'Top', '#222222'),
  ('96000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000002', 'B Item A', 'Top', '#333333'),
  ('97000000-0000-0000-0000-000000000001', '93000000-0000-0000-0000-000000000002', 'B Item B', 'Top', '#444444');

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
    '98000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000001'
  ),
  (
    '99000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000002',
    '96000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001'
  );

do $$
begin
  perform set_config(
    'test.initial_updated_at',
    (
      select updated_at::text
      from public.closet_replacement_legacy_links
      where id = '98000000-0000-0000-0000-000000000001'
    ),
    true
  );
end;
$$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"91000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$
    select public.revise_closet_replacement_legacy_link(
      '93000000-0000-0000-0000-000000000002',
      '99000000-0000-0000-0000-000000000001',
      (
        select updated_at
        from public.closet_replacement_legacy_links
        where id = '99000000-0000-0000-0000-000000000001'
      ),
      'parallel',
      'Other workspace'
    )
  $$,
  '42501',
  'workspace membership is required',
  'a member cannot revise another workspace review'
);

select lives_ok(
  $$
    select public.revise_closet_replacement_legacy_link(
      '93000000-0000-0000-0000-000000000001',
      '98000000-0000-0000-0000-000000000001',
      current_setting('test.initial_updated_at')::timestamptz,
      'a_to_b',
      'A was replaced by B'
    )
  $$,
  'a pending pair can receive its first review through the revision RPC'
);

select is(
  (
    select review_status
    from public.closet_replacement_legacy_links
    where id = '98000000-0000-0000-0000-000000000001'
  ),
  'reviewed',
  'the first revision updates the current review snapshot'
);

select is(
  (
    select count(*)::integer
    from public.closet_replacement_legacy_link_revisions
    where legacy_link_id = '98000000-0000-0000-0000-000000000001'
  ),
  1,
  'the first review creates revision one'
);

select is(
  (
    select decision
    from public.closet_replacement_legacy_link_revisions
    where legacy_link_id = '98000000-0000-0000-0000-000000000001'
      and revision_number = 1
  ),
  'a_to_b',
  'revision one preserves the initial decision'
);

select lives_ok(
  $$
    select public.revise_closet_replacement_legacy_link(
      '93000000-0000-0000-0000-000000000001',
      '98000000-0000-0000-0000-000000000001',
      (
        select updated_at
        from public.closet_replacement_legacy_links
        where id = '98000000-0000-0000-0000-000000000001'
      ),
      'b_to_a',
      'The later review corrected the direction'
    )
  $$,
  'a completed review can be revised intentionally'
);

select is(
  (
    select review_decision
    from public.closet_replacement_legacy_links
    where id = '98000000-0000-0000-0000-000000000001'
  ),
  'b_to_a',
  'the current snapshot contains the latest decision'
);

select is(
  (
    select count(*)::integer
    from public.closet_replacement_legacy_link_revisions
    where legacy_link_id = '98000000-0000-0000-0000-000000000001'
  ),
  2,
  'the corrected review appends instead of overwriting history'
);

select is(
  (
    select string_agg(decision, ',' order by revision_number)
    from public.closet_replacement_legacy_link_revisions
    where legacy_link_id = '98000000-0000-0000-0000-000000000001'
  ),
  'a_to_b,b_to_a',
  'review revisions remain in human decision order'
);

select throws_ok(
  $$
    select public.revise_closet_replacement_legacy_link(
      '93000000-0000-0000-0000-000000000001',
      '98000000-0000-0000-0000-000000000001',
      current_setting('test.initial_updated_at')::timestamptz,
      'parallel',
      'Stale overwrite attempt'
    )
  $$,
  '40001',
  'the legacy link changed after it was loaded',
  'a stale browser cannot overwrite a newer human review'
);

select throws_ok(
  $$
    select public.revise_closet_replacement_legacy_link(
      '93000000-0000-0000-0000-000000000001',
      '98000000-0000-0000-0000-000000000001',
      (
        select updated_at
        from public.closet_replacement_legacy_links
        where id = '98000000-0000-0000-0000-000000000001'
      ),
      'b_to_a',
      'The later review corrected the direction'
    )
  $$,
  '22023',
  'the review has no changes',
  'an unchanged review does not create a duplicate revision'
);

select * from finish();
rollback;
