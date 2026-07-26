-- Composite foreign-key indexes use the exact FK column order so Postgres can
-- validate parent updates/deletes without scanning the child tables.
create index if not exists closet_items_palette_workspace_fk_idx
  on public.closet_items (palette_id, workspace_id);

create index if not exists closet_outfit_items_outfit_workspace_fk_idx
  on public.closet_outfit_items (outfit_id, workspace_id);

create index if not exists closet_outfit_items_item_workspace_fk_idx
  on public.closet_outfit_items (item_id, workspace_id);

create index if not exists closet_wear_logs_outfit_workspace_fk_idx
  on public.closet_wear_logs (outfit_id, workspace_id);

create index if not exists closet_wear_logs_place_workspace_fk_idx
  on public.closet_wear_logs (place_id, workspace_id);

create index if not exists closet_wear_logs_transport_workspace_fk_idx
  on public.closet_wear_logs (transport_mode_id, workspace_id);

create index if not exists closet_replacement_items_line_workspace_fk_idx
  on public.closet_replacement_line_items (replacement_line_id, workspace_id);

create index if not exists closet_replacement_items_item_workspace_fk_idx
  on public.closet_replacement_line_items (item_id, workspace_id);

create index if not exists closet_item_images_item_workspace_fk_idx
  on public.closet_item_images (item_id, workspace_id);

create index if not exists closet_outfit_previews_outfit_workspace_fk_idx
  on public.closet_outfit_previews (outfit_id, workspace_id);
