create or replace function public.revise_closet_replacement_line_edge_details(
  p_workspace_id uuid,
  p_edge_id uuid,
  p_expected_updated_at timestamptz,
  p_branch_name text,
  p_decision_reason text
)
returns public.closet_replacement_line_edges
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_edge public.closet_replacement_line_edges;
  revised_edge public.closet_replacement_line_edges;
  normalized_branch_name text := nullif(trim(p_branch_name), '');
  normalized_reason text := trim(p_decision_reason);
  changed_at timestamptz;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if normalized_reason is null or normalized_reason = '' then
    raise exception using
      errcode = '22023',
      message = 'an edge decision reason is required';
  end if;

  if char_length(normalized_reason) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'the edge decision reason is too long';
  end if;

  if normalized_branch_name is not null
    and char_length(normalized_branch_name) > 200
  then
    raise exception using
      errcode = '22023',
      message = 'the branch name is too long';
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
      message = 'replacement lineage edge was not found';
  end if;

  if p_expected_updated_at is null
    or current_edge.updated_at is distinct from p_expected_updated_at
  then
    raise exception using
      errcode = '40001',
      message = 'the replacement lineage edge changed after it was loaded';
  end if;

  if current_edge.status <> 'confirmed' then
    raise exception using
      errcode = '22023',
      message = 'only a confirmed replacement lineage edge can be revised';
  end if;

  if current_edge.branch_name is not distinct from normalized_branch_name
    and current_edge.decision_reason = normalized_reason
  then
    raise exception using
      errcode = '22023',
      message = 'the replacement lineage edge has no changes';
  end if;

  changed_at := greatest(
    clock_timestamp(),
    current_edge.updated_at + interval '1 microsecond'
  );

  update public.closet_replacement_line_edges edge
  set
    branch_name = normalized_branch_name,
    decision_reason = normalized_reason,
    updated_at = changed_at
  where edge.id = p_edge_id
    and edge.workspace_id = p_workspace_id
  returning * into revised_edge;

  return revised_edge;
end;
$$;

revoke all on function public.revise_closet_replacement_line_edge_details(
  uuid,
  uuid,
  timestamptz,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.revise_closet_replacement_line_edge_details(
  uuid,
  uuid,
  timestamptz,
  text,
  text
) to authenticated;
