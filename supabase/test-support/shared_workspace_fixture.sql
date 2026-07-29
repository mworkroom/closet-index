-- CI-only prerequisite for reconstructing Closet Index on a blank local
-- Supabase database. Production already owns these shared workspace objects.

create schema if not exists private;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null
    references public.workspaces(id),
  user_id uuid not null
    references auth.users(id),
  role text not null
    check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function private.is_workspace_member(
  target_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_workspace_member(uuid)
from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_workspace_member(uuid)
to authenticated;
