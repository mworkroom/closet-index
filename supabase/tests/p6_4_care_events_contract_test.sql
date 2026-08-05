begin;

select plan(13);

select has_table('public', 'closet_care_events', 'CareEvent history has a live table');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.closet_care_events'::regclass),
  'CareEvent history has RLS enabled'
);
select has_pk('public', 'closet_care_events', 'CareEvent IDs are primary keys');
select has_column('public', 'closet_care_events', 'cared_on', 'CareEvent has a date');
select has_column('public', 'closet_care_events', 'care_method', 'CareEvent preserves method-at-event');
select col_type_is('public', 'closet_care_events', 'cared_on', 'date', 'CareEvent date uses PostgreSQL date');
select fk_ok(
  'public', 'closet_care_events', array['item_id', 'workspace_id'],
  'public', 'closet_items', array['id', 'workspace_id'],
  'CareEvent ownership matches its Item'
);
select has_index(
  'public',
  'closet_care_events',
  'closet_care_events_item_owner_fk_idx',
  'CareEvent Item ownership foreign key has a covering index'
);
select policies_are(
  'public',
  'closet_care_events',
  array[
    'closet_care_events_select_member',
    'closet_care_events_insert_member',
    'closet_care_events_update_member',
    'closet_care_events_delete_member'
  ],
  'CareEvents have member-scoped CRUD policies'
);
select table_privs_are(
  'public', 'closet_care_events', 'anon', array[]::text[],
  'anonymous clients have no CareEvent privileges'
);
select table_privs_are(
  'public', 'closet_care_events', 'authenticated', array['DELETE', 'SELECT'],
  'authenticated clients receive only table-level read and delete privileges'
);
select column_privs_are(
  'public', 'closet_care_events', 'cared_on', 'authenticated', array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated clients can read, insert, and correct the care date'
);
select column_privs_are(
  'public', 'closet_care_events', 'care_method', 'authenticated', array['INSERT', 'SELECT', 'UPDATE'],
  'authenticated clients can read, insert, and correct method-at-event'
);

select * from finish();
rollback;
