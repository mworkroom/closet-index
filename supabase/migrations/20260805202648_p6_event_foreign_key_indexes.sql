-- The history lookup indexes begin with workspace_id for app queries, but the
-- composite Item ownership foreign keys begin with item_id. Keep dedicated
-- covering indexes in FK column order so Item deletion cascades do not scan
-- the full event tables.

create index closet_purchase_events_item_owner_fk_idx
  on public.closet_purchase_events (item_id, workspace_id);

create index closet_care_events_item_owner_fk_idx
  on public.closet_care_events (item_id, workspace_id);
