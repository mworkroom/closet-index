create or replace function public.reverse_closet_replacement_line_edge(
  p_workspace_id uuid,
  p_edge_id uuid,
  p_expected_updated_at timestamptz
)
returns public.closet_replacement_line_edges
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_edge public.closet_replacement_line_edges;
  source_link public.closet_replacement_legacy_links;
  revised_link public.closet_replacement_legacy_links;
  reversed_edge public.closet_replacement_line_edges;
  reversed_decision text;
  changed_at timestamptz;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  select edge.*
  into current_edge
  from public.closet_replacement_line_edges edge
  where edge.id = p_edge_id
    and edge.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'replacement line edge was not found';
  end if;

  if p_expected_updated_at is null
    or current_edge.updated_at is distinct from p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'the replacement line edge changed after it was loaded';
  end if;

  if current_edge.status <> 'confirmed' then
    raise exception using
      errcode = '22023',
      message = 'only a confirmed replacement line edge can be reversed';
  end if;

  select link.*
  into source_link
  from public.closet_replacement_legacy_links link
  where link.id = current_edge.source_legacy_link_id
    and link.workspace_id = p_workspace_id
  for update;

  if not found
    or source_link.review_status <> 'reviewed'
    or source_link.review_decision not in ('a_to_b', 'b_to_a')
  then
    raise exception using
      errcode = '23514',
      message = 'a reviewed directional legacy link is required';
  end if;

  reversed_decision := case source_link.review_decision
    when 'a_to_b' then 'b_to_a'
    else 'a_to_b'
  end;

  select *
  into revised_link
  from public.revise_closet_replacement_legacy_link(
    p_workspace_id,
    source_link.id,
    source_link.updated_at,
    reversed_decision,
    source_link.review_reason
  );

  changed_at := greatest(
    clock_timestamp(),
    current_edge.updated_at + interval '1 microsecond',
    revised_link.updated_at + interval '1 microsecond'
  );

  update public.closet_replacement_line_edges edge
  set
    predecessor_item_id = current_edge.successor_item_id,
    successor_item_id = current_edge.predecessor_item_id,
    status = 'confirmed',
    confirmed_at = changed_at,
    confirmed_by = (select auth.uid()),
    updated_at = changed_at
  where edge.id = current_edge.id
    and edge.workspace_id = p_workspace_id
    and edge.status = 'needs_review'
  returning * into reversed_edge;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'the replacement line edge could not be re-confirmed';
  end if;

  return reversed_edge;
end;
$$;

revoke all on function public.reverse_closet_replacement_line_edge(
  uuid,
  uuid,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.reverse_closet_replacement_line_edge(
  uuid,
  uuid,
  timestamptz
) to authenticated;
