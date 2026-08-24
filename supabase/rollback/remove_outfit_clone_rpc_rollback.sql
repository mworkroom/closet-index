-- Emergency rollback for 20260824180057_remove_outfit_clone_rpc.sql.
-- Recreates the audited 2026-08-25 definition, grants, and lifecycle comment.

create function public.clone_closet_outfit(
  p_workspace_id uuid,
  p_source_outfit_id uuid,
  p_outfit_id uuid,
  p_display_name text default null
)
returns public.closet_outfits
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_outfit public.closet_outfits%rowtype;
  source_items jsonb;
begin
  if (select auth.uid()) is null
    or not (select private.is_workspace_member(p_workspace_id))
  then
    raise exception using
      errcode = '42501',
      message = 'workspace membership is required';
  end if;

  select *
  into source_outfit
  from public.closet_outfits
  where workspace_id = p_workspace_id
    and id = p_source_outfit_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'source outfit was not found';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'item_id', relation.item_id,
      'slot', relation.slot,
      'sort_order', relation.sort_order,
      'position_x', relation.position_x,
      'position_y', relation.position_y,
      'item_scale', relation.scale,
      'z_index', relation.z_index
    )
    order by relation.sort_order, relation.item_id
  )
  into source_items
  from public.closet_outfit_items relation
  where relation.workspace_id = p_workspace_id
    and relation.outfit_id = p_source_outfit_id;

  return private.create_closet_outfit_record(
    p_workspace_id,
    p_outfit_id,
    coalesce(p_display_name, source_outfit.display_name),
    source_items,
    true
  );
end;
$$;

revoke all on function public.clone_closet_outfit(
  uuid,
  uuid,
  uuid,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.clone_closet_outfit(
  uuid,
  uuid,
  uuid,
  text
) to authenticated, service_role;

comment on function public.clone_closet_outfit(uuid, uuid, uuid, text)
is '역할=Outfit과 구성을 원자 복제; source_of_truth=closet_outfits와 closet_outfit_items; lifecycle=LIVE_CORE';
