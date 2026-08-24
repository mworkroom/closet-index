-- Outfit duplication now uses client-side source prefill followed by the
-- retained public.create_closet_outfit transaction. A 2026-08-25 live audit
-- found one exact overload, no reverse dependencies, and no runtime calls
-- since pg_stat_statements was reset on 2026-07-18.
--
-- Omit IF EXISTS so migration drift fails closed, and omit CASCADE so an
-- unexpected dependency cannot be removed with this obsolete RPC.

drop function public.clone_closet_outfit(uuid, uuid, uuid, text);
