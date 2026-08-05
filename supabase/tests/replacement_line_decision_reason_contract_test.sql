begin;

select plan(5);

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
    not like '%''단순 교체''%'
  and pg_get_functiondef('public.update_closet_replacement_line_edge_connection(uuid,uuid,timestamptz,uuid,text,text)'::regprocedure)
    not like '%''멸종 후 교체''%',
  'retired decision reason values are no longer accepted'
);

select is(
  (
    select count(*)::integer
    from public.closet_replacement_line_edges
    where decision_reason in ('단순 교체', '멸종 후 교체')
  ),
  0,
  'existing rows no longer contain retired decision reason values'
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
