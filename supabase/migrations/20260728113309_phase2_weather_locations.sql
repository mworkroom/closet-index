-- Closet Index Phase 2 W2: workspace-owned weather forecast locations.
-- The KMA grid is stored instead of precise GPS coordinates.

do $$
begin
  if to_regclass('public.workspaces') is null
    or to_regprocedure('private.is_workspace_member(uuid)') is null
  then
    raise exception
      'Closet weather locations require the shared workspaces and private.is_workspace_member(uuid) contract';
  end if;
end
$$;

create table public.closet_weather_locations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  label text not null,
  official_name text,
  admin_code text,
  nx integer not null,
  ny integer not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closet_weather_locations_label_not_blank
    check (btrim(label) <> ''),
  constraint closet_weather_locations_official_name_not_blank
    check (official_name is null or btrim(official_name) <> ''),
  constraint closet_weather_locations_admin_code_format
    check (admin_code is null or admin_code ~ '^[0-9]{10}$'),
  constraint closet_weather_locations_nx_positive
    check (nx > 0),
  constraint closet_weather_locations_ny_positive
    check (ny > 0),
  constraint closet_weather_locations_id_workspace_unique
    unique (id, workspace_id),
  constraint closet_weather_locations_workspace_admin_code_unique
    unique (workspace_id, admin_code)
);

create unique index closet_weather_locations_one_default_per_workspace_idx
  on public.closet_weather_locations (workspace_id)
  where is_default;

create index closet_weather_locations_workspace_label_idx
  on public.closet_weather_locations (workspace_id, label);

revoke all on table public.closet_weather_locations from anon, authenticated;

grant select on table public.closet_weather_locations to authenticated;

grant insert (
  id,
  workspace_id,
  label,
  official_name,
  admin_code,
  nx,
  ny,
  is_default,
  created_at,
  updated_at
) on table public.closet_weather_locations to authenticated;

grant update (
  label,
  official_name,
  admin_code,
  nx,
  ny,
  is_default,
  updated_at
) on table public.closet_weather_locations to authenticated;

grant delete on table public.closet_weather_locations to authenticated;

alter table public.closet_weather_locations enable row level security;

create policy closet_weather_locations_select_member
on public.closet_weather_locations
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_weather_locations_insert_member
on public.closet_weather_locations
for insert
to authenticated
with check ((select private.is_workspace_member(workspace_id)));

create policy closet_weather_locations_update_member
on public.closet_weather_locations
for update
to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy closet_weather_locations_delete_member
on public.closet_weather_locations
for delete
to authenticated
using ((select private.is_workspace_member(workspace_id)));

insert into public.closet_weather_locations (
  workspace_id,
  label,
  official_name,
  admin_code,
  nx,
  ny,
  is_default
)
values (
  '00000000-0000-0000-0000-000000000003'::uuid,
  '창4동',
  '서울특별시 도봉구 창제4동',
  '1132051400',
  61,
  129,
  true
)
on conflict (workspace_id, admin_code) do update
set
  label = excluded.label,
  official_name = excluded.official_name,
  nx = excluded.nx,
  ny = excluded.ny,
  is_default = excluded.is_default,
  updated_at = now();
