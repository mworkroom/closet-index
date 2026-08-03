create or replace function public.review_closet_replacement_legacy_link(
  p_workspace_id uuid,
  p_link_id uuid,
  p_decision text,
  p_reason text
)
returns public.closet_replacement_legacy_links
language plpgsql
security definer
set search_path = ''
as $$
declare
  pending_link public.closet_replacement_legacy_links;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  select link.*
  into pending_link
  from public.closet_replacement_legacy_links link
  where link.id = p_link_id
    and link.workspace_id = p_workspace_id
    and link.review_status = 'pending';

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'pending legacy link was not found';
  end if;

  return public.revise_closet_replacement_legacy_link(
    p_workspace_id,
    p_link_id,
    pending_link.updated_at,
    p_decision,
    p_reason
  );
end;
$$;

revoke all on function public.review_closet_replacement_legacy_link(
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.review_closet_replacement_legacy_link(
  uuid,
  uuid,
  text,
  text
) to authenticated;
