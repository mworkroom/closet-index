create or replace function public.confirm_closet_replacement_line_edges(
  p_workspace_id uuid,
  p_candidates jsonb
)
returns setof public.closet_replacement_line_edges
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  confirmed_edge public.closet_replacement_line_edges;
  candidate_count integer;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'edge candidates must be a JSON array';
  end if;

  candidate_count := jsonb_array_length(p_candidates);
  if candidate_count < 1 or candidate_count > 200 then
    raise exception using
      errcode = '22023',
      message = 'between 1 and 200 edge candidates are required';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_candidates) as entry(source_legacy_link_id uuid)
    group by entry.source_legacy_link_id
    having entry.source_legacy_link_id is null or count(*) > 1
  ) then
    raise exception using
      errcode = '22023',
      message = 'edge candidate source links must be present and unique';
  end if;

  for candidate in
    select entry.*
    from jsonb_to_recordset(p_candidates) as entry(
      replacement_line_id uuid,
      source_legacy_link_id uuid,
      expected_legacy_updated_at timestamptz,
      branch_name text,
      decision_reason text
    )
    order by entry.replacement_line_id, entry.source_legacy_link_id
  loop
    if candidate.replacement_line_id is null
      or candidate.expected_legacy_updated_at is null
    then
      raise exception using
        errcode = '22023',
        message = 'each edge candidate requires a Line and expected timestamp';
    end if;

    select public.confirm_closet_replacement_line_edge(
      p_workspace_id,
      candidate.replacement_line_id,
      candidate.source_legacy_link_id,
      candidate.expected_legacy_updated_at,
      candidate.branch_name,
      candidate.decision_reason
    )
    into confirmed_edge;

    return next confirmed_edge;
  end loop;

  return;
end;
$$;

revoke all on function public.confirm_closet_replacement_line_edges(uuid, jsonb)
from public, anon, authenticated;

grant execute on function public.confirm_closet_replacement_line_edges(uuid, jsonb)
to authenticated;
