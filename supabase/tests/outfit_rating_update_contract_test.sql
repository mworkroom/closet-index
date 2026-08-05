begin;

select plan(9);

select has_function(
  'public',
  'update_closet_outfit_with_rating',
  array['uuid', 'uuid', 'text', 'text', 'jsonb', 'boolean'],
  'Outfit update RPC accepts rating'
);

select ok(
  pg_get_functiondef('public.update_closet_outfit_with_rating(uuid,uuid,text,text,jsonb,boolean)'::regprocedure)
    like '%p_rating is null or p_rating not in (''favorite'', ''ok'', ''error'')%',
  'Outfit update RPC validates rating values'
);

select ok(
  pg_get_functiondef('public.update_closet_outfit_with_rating(uuid,uuid,text,text,jsonb,boolean)'::regprocedure)
    like '%rating = p_rating%',
  'Outfit update RPC persists rating in the same transaction'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_closet_outfit_with_rating(uuid,uuid,text,text,jsonb,boolean)',
    'EXECUTE'
  ),
  'authenticated can update an Outfit'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.update_closet_outfit_with_rating(uuid,uuid,text,text,jsonb,boolean)',
    'EXECUTE'
  ),
  'anon cannot update an Outfit'
);

select col_not_null(
  'public',
  'closet_outfits',
  'rating',
  'Outfit rating is required'
);

select col_default_is(
  'public',
  'closet_outfits',
  'rating',
  '''ok''::text',
  'new Outfit rating defaults to OK'
);

select is(
  (select count(*)::integer from public.closet_outfits where rating is null),
  0,
  'no Outfit keeps a missing rating'
);

select has_trigger(
  'public',
  'closet_outfits',
  'normalize_closet_outfit_rating',
  'legacy writers that submit NULL are normalized to OK'
);

select * from finish();
rollback;
