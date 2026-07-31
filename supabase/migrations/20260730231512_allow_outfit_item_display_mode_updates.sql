-- Outfit image editing already requires workspace membership through
-- closet_outfit_items_update_position_member. Extend the column-level grant so
-- an authenticated member can also choose the saved layer/slot for one
-- Outfit-Item relation without granting broad table UPDATE access.
grant update (slot, z_index)
on table public.closet_outfit_items
to authenticated;
