begin;

select plan(22);

select has_column('public', 'closet_places', 'place_kind', 'Place has an HVAC scope kind');
select col_not_null('public', 'closet_places', 'place_kind', 'Place kind is required');
select col_default_is('public', 'closet_places', 'place_kind', 'specific_venue', 'new Places default to specific venues');
select has_column('public', 'closet_wear_logs', 'observed_hvac_mode', 'Wear Log stores actual HVAC mode');
select col_not_null('public', 'closet_wear_logs', 'observed_hvac_mode', 'actual HVAC mode is required');
select col_default_is('public', 'closet_wear_logs', 'observed_hvac_mode', 'off', 'existing and new Wear Logs default to off');
select has_column('public', 'closet_wear_logs', 'observed_hvac_intensity', 'Wear Log stores actual HVAC intensity');
select hasnt_column('public', 'closet_wear_logs', 'observed_hvac_memo', 'Wear Log reuses the general memo for optional HVAC prose');
select column_privs_are(
  'public', 'closet_wear_logs', 'observed_hvac_mode', 'authenticated', array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated clients can read and manually maintain actual HVAC mode'
);

select has_table('public', 'closet_place_hvac_profiles', 'seasonal Place HVAC profiles have a live table');
select has_pk('public', 'closet_place_hvac_profiles', 'Place Profile uses a natural seasonal primary key');
select fk_ok(
  'public', 'closet_place_hvac_profiles', array['place_id', 'workspace_id'],
  'public', 'closet_places', array['id', 'workspace_id'],
  'Place Profile ownership matches its Place'
);
select has_column('public', 'closet_place_hvac_profiles', 'season', 'Place Profile stores season');
select has_column('public', 'closet_place_hvac_profiles', 'expected_hvac_mode', 'Place Profile stores expected mode');
select has_column('public', 'closet_place_hvac_profiles', 'expected_hvac_intensity', 'Place Profile stores expected intensity');
select has_column('public', 'closet_place_hvac_profiles', 'memo', 'Place Profile stores its own memo');
select has_column('public', 'closet_place_hvac_profiles', 'source', 'Place Profile stores source');
select has_column('public', 'closet_place_hvac_profiles', 'last_confirmed_on', 'Place Profile stores last confirmed date');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.closet_place_hvac_profiles'::regclass),
  'Place Profile has RLS enabled'
);
select policies_are(
  'public',
  'closet_place_hvac_profiles',
  array[
    'closet_place_hvac_profiles_select_member',
    'closet_place_hvac_profiles_insert_member',
    'closet_place_hvac_profiles_update_member'
  ],
  'Place Profile has only manual read/create/update member policies'
);
select table_privs_are(
  'public', 'closet_place_hvac_profiles', 'anon', array[]::text[],
  'anonymous clients have no Place Profile privileges'
);
select table_privs_are(
  'public', 'closet_place_hvac_profiles', 'authenticated', array['SELECT'],
  'authenticated clients receive only table-level read access'
);

select * from finish();
rollback;
