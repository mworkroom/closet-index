begin;

select plan(9);

select has_column(
  'public',
  'closet_replacement_lines',
  'color_category',
  'Replacement Lines store a human-selected color category'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.closet_replacement_lines'::regclass
      and conname = 'closet_replacement_lines_color_category_length'
  ),
  'color category has a readable length and whitespace contract'
);

select has_function(
  'public',
  'set_closet_replacement_line_color_category',
  array['uuid', 'uuid', 'timestamp with time zone', 'text'],
  'color category save RPC exists'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.set_closet_replacement_line_color_category(uuid,uuid,timestamptz,text)'::regprocedure
  ),
  'color category RPC is a controlled security-definer boundary'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.set_closet_replacement_line_color_category(uuid,uuid,timestamptz,text)',
    'execute'
  ),
  'authenticated members can save a Line color category'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.set_closet_replacement_line_color_category(uuid,uuid,timestamptz,text)',
    'execute'
  ),
  'anonymous users cannot save Line colors'
);

select ok(
  pg_get_functiondef(
    'public.set_closet_replacement_line_color_category(uuid,uuid,timestamptz,text)'::regprocedure
  ) like '%is_workspace_member%',
  'the RPC checks workspace membership'
);

select ok(
  pg_get_functiondef(
    'public.set_closet_replacement_line_color_category(uuid,uuid,timestamptz,text)'::regprocedure
  ) like '%for update%',
  'the RPC locks the Line before optimistic comparison'
);

select ok(
  pg_get_functiondef(
    'public.set_closet_replacement_line_color_category(uuid,uuid,timestamptz,text)'::regprocedure
  ) like '%updated_at is distinct from p_expected_updated_at%',
  'the RPC rejects stale edits'
);

select * from finish();
rollback;
