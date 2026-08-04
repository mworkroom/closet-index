-- Outfit previews were a derived image cache. The product no longer needs the
-- cache, but Outfit deletion must keep its workspace and Wear Log safeguards.

drop policy if exists closet_images_select_ready_member
on storage.objects;

create policy closet_images_select_ready_member
on storage.objects
for select
to authenticated
using (
  bucket_id = 'closet-images'
  and case
    when (storage.foldername(name))[1] ~* (
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
      || '[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    then (
      select private.is_workspace_member(
        ((storage.foldername(name))[1])::uuid
      )
    )
    else false
  end
  and exists (
    select 1
    from public.closet_item_images image
    where image.storage_path = name
      and image.status = 'ready'
  )
);

drop trigger if exists closet_item_images_mark_preview_stale
on public.closet_item_images;
drop trigger if exists closet_outfit_items_mark_preview_stale
on public.closet_outfit_items;

drop function if exists private.mark_outfit_preview_stale_from_item_image();
drop function if exists private.mark_outfit_preview_stale_from_relation();

drop function if exists public.begin_closet_outfit_preview_upload(
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  integer,
  text
);
drop function if exists public.finalize_closet_outfit_preview_upload(
  uuid,
  uuid,
  uuid
);
drop function if exists public.cancel_closet_outfit_preview_upload(
  uuid,
  uuid,
  uuid
);

create or replace function public.delete_closet_outfit_if_unworn(
  p_user_id uuid,
  p_workspace_id uuid,
  p_outfit_id uuid
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = p_workspace_id
      and member.user_id = p_user_id
  ) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  perform 1
  from public.closet_outfits outfit
  where outfit.workspace_id = p_workspace_id
    and outfit.id = p_outfit_id
  for update;

  if not found then
    raise exception 'Outfit을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.closet_wear_logs log
    where log.workspace_id = p_workspace_id
      and log.outfit_id = p_outfit_id
  ) then
    raise exception '착용 기록이 있는 Outfit은 삭제할 수 없습니다.'
      using errcode = 'P0001';
  end if;

  delete from public.closet_outfits outfit
  where outfit.workspace_id = p_workspace_id
    and outfit.id = p_outfit_id;

  return array[]::text[];
end;
$$;

revoke all on function public.delete_closet_outfit_if_unworn(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated;
grant execute on function public.delete_closet_outfit_if_unworn(
  uuid,
  uuid,
  uuid
) to service_role;

comment on function public.delete_closet_outfit_if_unworn(uuid, uuid, uuid)
is 'ROLE: safely deletes an unworn Outfit; SOURCE OF TRUTH: no, write transaction boundary; LIFECYCLE: LIVE_SUPPORT.';

drop table public.closet_outfit_previews;
