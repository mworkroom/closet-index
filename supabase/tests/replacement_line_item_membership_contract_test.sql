begin;

select plan(18);

select has_function(
  'public',
  'add_closet_replacement_line_item',
  array['uuid', 'uuid', 'uuid', 'timestamp with time zone'],
  'unassigned Item add RPC exists'
);

select has_function(
  'public',
  'remove_closet_replacement_line_item',
  array['uuid', 'uuid', 'uuid', 'timestamp with time zone'],
  'remove Item from every Line RPC exists'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.add_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure),
  'Item add RPC is a controlled security-definer boundary'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure),
  'Item remove RPC is a controlled security-definer boundary'
);

select ok(
  has_function_privilege('authenticated', 'public.add_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)', 'execute'),
  'authenticated members can add an Item'
);

select ok(
  has_function_privilege('authenticated', 'public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)', 'execute'),
  'authenticated members can remove an Item'
);

select ok(
  not has_function_privilege('anon', 'public.add_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)', 'execute'),
  'anonymous users cannot add an Item'
);

select ok(
  not has_function_privilege('anon', 'public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)', 'execute'),
  'anonymous users cannot remove an Item'
);

select ok(
  pg_get_functiondef('public.add_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%is_workspace_member%',
  'Item add checks workspace membership'
);

select ok(
  pg_get_functiondef('public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%is_workspace_member%',
  'Item remove checks workspace membership'
);

select ok(
  pg_get_functiondef('public.add_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%closet_items%for update%',
  'Item add locks the Closet Item against concurrent membership changes'
);

select ok(
  pg_get_functiondef('public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%closet_items%for update%',
  'Item remove locks the Closet Item against concurrent membership changes'
);

select ok(
  pg_get_functiondef('public.add_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%updated_at is distinct from p_expected_updated_at%',
  'Item add rejects stale Line edits'
);

select ok(
  pg_get_functiondef('public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%updated_at is distinct from p_expected_source_updated_at%',
  'Item remove rejects stale Line edits'
);

select ok(
  pg_get_functiondef('public.add_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%the item already belongs to a replacement line%'
  and pg_get_functiondef('public.add_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%closet_replacement_line_starts%'
  and pg_get_functiondef('public.add_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%review_status = ''needs_review''%',
  'Item add accepts only unassigned Items, creates a start, and requests review'
);

select ok(
  pg_get_functiondef('public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%disconnect all lineage edges%'
  and pg_get_functiondef('public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%predecessor_item_id%'
  and pg_get_functiondef('public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%successor_item_id%',
  'Item remove requires every lineage connection to be disconnected first'
);

select ok(
  pg_get_functiondef('public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%delete from public.closet_replacement_line_starts%'
  and pg_get_functiondef('public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%delete from public.closet_replacement_line_items%'
  and pg_get_functiondef('public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%item_id = p_item_id%',
  'Item remove clears starts and memberships for the Item across all Lines'
);

select ok(
  pg_get_functiondef('public.add_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%lifecycle_status <> ''active''%'
  and pg_get_functiondef('public.remove_closet_replacement_line_item(uuid,uuid,uuid,timestamptz)'::regprocedure) like '%lifecycle_status <> ''active''%',
  'membership changes require an active source Line'
);

select * from finish();
rollback;
