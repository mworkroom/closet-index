-- Synthetic pre-cleanup fixture for the Legacy Link removal round trip.
-- Applied only after the cleanup migration has been temporarily withheld.

begin;

insert into auth.users (id, email)
values (
  '95000000-0000-0000-0000-000000000001',
  'legacy-cleanup-owner@example.test'
);

insert into public.workspaces (id, name)
values (
  '51000000-0000-0000-0000-000000000001',
  'Legacy cleanup contract workspace'
);

insert into public.workspace_members (workspace_id, user_id, role)
values (
  '51000000-0000-0000-0000-000000000001',
  '95000000-0000-0000-0000-000000000001',
  'admin'
);

insert into public.closet_items (
  id,
  workspace_id,
  name,
  category,
  display_hex
)
values
  (
    '51100000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001',
    'Cleanup Item A',
    'Top',
    '#111111'
  ),
  (
    '51200000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001',
    'Cleanup Item B',
    'Top',
    '#222222'
  ),
  (
    '51300000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001',
    'Cleanup Item C',
    'Top',
    '#333333'
  ),
  (
    '51400000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001',
    'Cleanup Item D',
    'Top',
    '#444444'
  ),
  (
    '51500000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001',
    'Cleanup Item E',
    'Top',
    '#555555'
  );

insert into public.closet_replacement_lines (
  id,
  workspace_id,
  name
)
values (
  '52000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  'Cleanup Line'
);

insert into public.closet_replacement_line_items (
  workspace_id,
  replacement_line_id,
  item_id
)
values
  (
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '51100000-0000-0000-0000-000000000001'
  ),
  (
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '51200000-0000-0000-0000-000000000001'
  ),
  (
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '51300000-0000-0000-0000-000000000001'
  ),
  (
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '51400000-0000-0000-0000-000000000001'
  ),
  (
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '51500000-0000-0000-0000-000000000001'
  );

insert into public.closet_replacement_legacy_links (
  id,
  workspace_id,
  item_a_id,
  item_b_id,
  source,
  source_item_a_notion_page_id,
  source_item_b_notion_page_id,
  review_status,
  review_decision,
  review_reason,
  reviewed_at,
  reviewed_by,
  created_at,
  updated_at
)
values (
  '53000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '51100000-0000-0000-0000-000000000001',
  '51200000-0000-0000-0000-000000000001',
  'notion_replaces',
  '61100000-0000-0000-0000-000000000001',
  '61200000-0000-0000-0000-000000000001',
  'reviewed',
  'a_to_b',
  'Synthetic reviewed direction',
  '2026-08-20T09:00:00Z',
  '95000000-0000-0000-0000-000000000001',
  '2026-08-20T08:00:00Z',
  '2026-08-20T09:00:00Z'
);

insert into public.closet_replacement_legacy_link_revisions (
  id,
  workspace_id,
  legacy_link_id,
  revision_number,
  decision,
  reason,
  reviewed_at,
  reviewed_by,
  created_at
)
values (
  '54000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000001',
  '53000000-0000-0000-0000-000000000001',
  1,
  'a_to_b',
  'Synthetic reviewed direction',
  '2026-08-20T09:00:00Z',
  '95000000-0000-0000-0000-000000000001',
  '2026-08-20T09:00:00Z'
);

insert into public.closet_replacement_line_edges (
  id,
  workspace_id,
  replacement_line_id,
  predecessor_item_id,
  successor_item_id,
  source_legacy_link_id,
  source_kind,
  branch_name,
  decision_reason,
  status,
  confirmed_at,
  confirmed_by,
  created_at,
  updated_at
)
values
  (
    '55000000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '51100000-0000-0000-0000-000000000001',
    '51200000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001',
    'legacy_link',
    'Original branch',
    '대체 시도',
    'confirmed',
    '2026-08-20T10:00:00Z',
    '95000000-0000-0000-0000-000000000001',
    '2026-08-20T10:00:00Z',
    '2026-08-20T10:00:00Z'
  ),
  (
    '55100000-0000-0000-0000-000000000001',
    '51000000-0000-0000-0000-000000000001',
    '52000000-0000-0000-0000-000000000001',
    '51200000-0000-0000-0000-000000000001',
    '51300000-0000-0000-0000-000000000001',
    null,
    'manual',
    null,
    '온도 세분화',
    'confirmed',
    '2026-08-20T11:00:00Z',
    '95000000-0000-0000-0000-000000000001',
    '2026-08-20T11:00:00Z',
    '2026-08-20T11:00:00Z'
  );

commit;
