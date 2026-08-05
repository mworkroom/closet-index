begin;

select plan(8);

select has_function(
  'public',
  'create_closet_replacement_line',
  array['uuid', 'text', 'text', 'text'],
  'empty Replacement Line creation RPC exists'
);

select ok(
  (select prosecdef from pg_proc where oid = 'public.create_closet_replacement_line(uuid,text,text,text)'::regprocedure),
  'Line creation uses the controlled workspace mutation boundary'
);

select is(
  (select proconfig from pg_proc where oid = 'public.create_closet_replacement_line(uuid,text,text,text)'::regprocedure),
  array['search_path=""'],
  'Line creation pins an empty search_path'
);

select ok(
  has_function_privilege('authenticated', 'public.create_closet_replacement_line(uuid,text,text,text)', 'execute'),
  'authenticated members can create a Line'
);

select ok(
  not has_function_privilege('anon', 'public.create_closet_replacement_line(uuid,text,text,text)', 'execute'),
  'anonymous users cannot create a Line'
);

select ok(
  pg_get_functiondef('public.create_closet_replacement_line(uuid,text,text,text)'::regprocedure) like '%is_workspace_member%',
  'Line creation verifies workspace membership'
);

select ok(
  pg_get_functiondef('public.create_closet_replacement_line(uuid,text,text,text)'::regprocedure) like '%replacement line color category is required%'
  and pg_get_functiondef('public.create_closet_replacement_line(uuid,text,text,text)'::regprocedure) like '%char_length(normalized_name) > 200%'
  and pg_get_functiondef('public.create_closet_replacement_line(uuid,text,text,text)'::regprocedure) like '%char_length(normalized_color_category) > 40%',
  'Line creation validates required and bounded metadata'
);

select ok(
  pg_get_functiondef('public.create_closet_replacement_line(uuid,text,text,text)'::regprocedure) like '%''ready''%'
  and pg_get_functiondef('public.create_closet_replacement_line(uuid,text,text,text)'::regprocedure) like '%''active''%',
  'a newly created empty Line starts active and review-ready'
);

select * from finish();
rollback;
