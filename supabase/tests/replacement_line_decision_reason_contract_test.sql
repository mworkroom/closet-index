begin;

select plan(4);

select has_function(
  'public',
  'update_closet_replacement_line_edge_connection',
  array['uuid', 'uuid', 'timestamp with time zone', 'uuid', 'text', 'text'],
  'edge connection update RPC exists'
);

select ok(
  pg_get_functiondef('public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure)
    like '%''대체 시도'', ''온도 세분화'', ''기능 세분화'', ''계승 👑''%',
  'edge connection updates accept the four current decision reasons'
);

select ok(
  pg_get_functiondef('public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure)
    not like '%''단순 교체'', ''멸종 후 교체'', ''계승 👑''%',
  'edge connection updates no longer accept the retired decision reason list'
);

select is(
  col_description('public.closet_replacement_line_edges'::regclass, (
    select attnum
    from pg_attribute
    where attrelid = 'public.closet_replacement_line_edges'::regclass
      and attname = 'decision_reason'
  )),
  '역할=대체 시도, 온도 세분화, 기능 세분화, 계승 판단; source_of_truth=closet_replacement_line_edges; lifecycle=LIVE_CORE',
  'decision reason documentation lists the current meanings'
);

select * from finish();
rollback;
