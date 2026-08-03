drop index if exists public.closet_replacement_line_edges_successor_idx;

create index closet_replacement_line_edges_successor_idx
  on public.closet_replacement_line_edges (
    workspace_id,
    replacement_line_id,
    successor_item_id
  );

create index closet_replacement_line_edges_source_workspace_fk_idx
  on public.closet_replacement_line_edges (
    source_legacy_link_id,
    workspace_id
  );
