create index closet_replacement_legacy_links_item_a_workspace_fk_idx
  on public.closet_replacement_legacy_links (item_a_id, workspace_id);

create index closet_replacement_legacy_links_item_b_workspace_fk_idx
  on public.closet_replacement_legacy_links (item_b_id, workspace_id);

create index closet_replacement_legacy_links_reviewed_by_fk_idx
  on public.closet_replacement_legacy_links (reviewed_by)
  where reviewed_by is not null;
