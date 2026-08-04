begin;

select plan(24);

select has_function(
  'public',
  'acknowledge_closet_replacement_line_review',
  array['uuid', 'uuid', 'timestamp with time zone'],
  'Line membership review completion RPC exists'
);

select has_function(
  'public',
  'update_closet_replacement_line_details',
  array['uuid', 'uuid', 'timestamp with time zone', 'text', 'text'],
  'Line details update RPC exists'
);

select has_function(
  'public',
  'delete_empty_closet_replacement_line',
  array['uuid', 'uuid', 'timestamp with time zone'],
  'empty Line deletion RPC exists'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.acknowledge_closet_replacement_line_review(uuid,uuid,timestamptz)'::regprocedure),
  'review completion RPC is a controlled security-definer boundary'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.update_closet_replacement_line_details(uuid,uuid,timestamptz,text,text)'::regprocedure),
  'details update RPC is a controlled security-definer boundary'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.delete_empty_closet_replacement_line(uuid,uuid,timestamptz)'::regprocedure),
  'empty deletion RPC is a controlled security-definer boundary'
);

select ok(
  has_function_privilege('authenticated', 'public.acknowledge_closet_replacement_line_review(uuid,uuid,timestamptz)', 'execute'),
  'authenticated members can complete Line review'
);

select ok(
  has_function_privilege('authenticated', 'public.update_closet_replacement_line_details(uuid,uuid,timestamptz,text,text)', 'execute'),
  'authenticated members can update Line details'
);

select ok(
  has_function_privilege('authenticated', 'public.delete_empty_closet_replacement_line(uuid,uuid,timestamptz)', 'execute'),
  'authenticated members can request empty Line deletion'
);

select ok(
  not has_function_privilege('anon', 'public.acknowledge_closet_replacement_line_review(uuid,uuid,timestamptz)', 'execute'),
  'anonymous users cannot complete Line review'
);

select ok(
  not has_function_privilege('anon', 'public.update_closet_replacement_line_details(uuid,uuid,timestamptz,text,text)', 'execute'),
  'anonymous users cannot update Line details'
);

select ok(
  not has_function_privilege('anon', 'public.delete_empty_closet_replacement_line(uuid,uuid,timestamptz)', 'execute'),
  'anonymous users cannot delete empty Lines'
);

select ok(
  pg_get_functiondef('public.acknowledge_closet_replacement_line_review(uuid,uuid,timestamptz)'::regprocedure) like '%is_workspace_member%',
  'review completion checks workspace membership'
);

select ok(
  pg_get_functiondef('public.update_closet_replacement_line_details(uuid,uuid,timestamptz,text,text)'::regprocedure) like '%is_workspace_member%',
  'details update checks workspace membership'
);

select ok(
  pg_get_functiondef('public.delete_empty_closet_replacement_line(uuid,uuid,timestamptz)'::regprocedure) like '%is_workspace_member%',
  'empty deletion checks workspace membership'
);

select ok(
  pg_get_functiondef('public.acknowledge_closet_replacement_line_review(uuid,uuid,timestamptz)'::regprocedure) like '%for update%',
  'review completion locks the Line'
);

select ok(
  pg_get_functiondef('public.update_closet_replacement_line_details(uuid,uuid,timestamptz,text,text)'::regprocedure) like '%for update%',
  'details update locks the Line'
);

select ok(
  pg_get_functiondef('public.delete_empty_closet_replacement_line(uuid,uuid,timestamptz)'::regprocedure) like '%for update%',
  'empty deletion locks the Line'
);

select ok(
  pg_get_functiondef('public.acknowledge_closet_replacement_line_review(uuid,uuid,timestamptz)'::regprocedure) like '%updated_at is distinct from p_expected_updated_at%',
  'review completion rejects stale edits'
);

select ok(
  pg_get_functiondef('public.update_closet_replacement_line_details(uuid,uuid,timestamptz,text,text)'::regprocedure) like '%updated_at is distinct from p_expected_updated_at%',
  'details update rejects stale edits'
);

select ok(
  pg_get_functiondef('public.delete_empty_closet_replacement_line(uuid,uuid,timestamptz)'::regprocedure) like '%updated_at is distinct from p_expected_updated_at%',
  'empty deletion rejects stale edits'
);

select ok(
  pg_get_functiondef('public.acknowledge_closet_replacement_line_review(uuid,uuid,timestamptz)'::regprocedure) like '%edge.status = ''needs_review''%',
  'review completion is blocked by pending lineage edges'
);

select ok(
  pg_get_functiondef('public.update_closet_replacement_line_details(uuid,uuid,timestamptz,text,text)'::regprocedure) like '%normalized_name is null%'
  and pg_get_functiondef('public.update_closet_replacement_line_details(uuid,uuid,timestamptz,text,text)'::regprocedure) like '%lifecycle_status <> ''active''%',
  'details update requires a name and an active Line'
);

select ok(
  pg_get_functiondef('public.delete_empty_closet_replacement_line(uuid,uuid,timestamptz)'::regprocedure) like '%closet_replacement_line_items%'
  and pg_get_functiondef('public.delete_empty_closet_replacement_line(uuid,uuid,timestamptz)'::regprocedure) like '%closet_replacement_line_edges%'
  and pg_get_functiondef('public.delete_empty_closet_replacement_line(uuid,uuid,timestamptz)'::regprocedure) like '%closet_replacement_line_starts%'
  and pg_get_functiondef('public.delete_empty_closet_replacement_line(uuid,uuid,timestamptz)'::regprocedure) like '%representative_line_id = p_line_id%',
  'deletion checks every membership, lineage, start, and representative dependency'
);

select * from finish();
rollback;
