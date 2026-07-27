grant update (position_x, position_y)
on table public.closet_outfit_items
to authenticated;

create policy closet_outfit_items_update_position_member
on public.closet_outfit_items
for update
to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));
