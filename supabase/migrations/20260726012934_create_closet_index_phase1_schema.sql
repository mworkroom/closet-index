-- Closet Index Phase 1A (shared mworkroom workspace)
-- Source of truth: docs/planning/product-plan.md and phase-1-mvp-spec.md.
-- Target: the shared mworkroom project and its workspace-based Auth/RLS model.

do $$
begin
  if to_regclass('public.workspaces') is null
    or to_regclass('public.workspace_members') is null
    or to_regprocedure('private.is_workspace_member(uuid)') is null
  then
    raise exception
      'Closet Index requires the shared workspaces, workspace_members, and private.is_workspace_member(uuid) contract';
  end if;
end
$$;

insert into public.workspaces (id, name)
values (
  '00000000-0000-0000-0000-000000000003',
  'closet-index'
)
on conflict (id) do update
set name = excluded.name;

-- Reuse the same two mworkroom login memberships as inventory-tracker.
insert into public.workspace_members (workspace_id, user_id, role)
select
  '00000000-0000-0000-0000-000000000003'::uuid,
  wm.user_id,
  wm.role
from public.workspace_members wm
where wm.workspace_id = '00000000-0000-0000-0000-000000000002'::uuid
on conflict (workspace_id, user_id) do update
set role = excluded.role;

create table public.closet_color_palette (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  notion_icon_id text not null,
  display_name text not null,
  display_hex text not null,
  semantic_color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closet_color_palette_display_hex_format
    check (display_hex ~ '^#[0-9A-Fa-f]{6}$'),
  constraint closet_color_palette_workspace_icon_unique unique (workspace_id, notion_icon_id),
  constraint closet_color_palette_id_workspace_unique unique (id, workspace_id)
);

create table public.closet_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  notion_page_id uuid,
  name text not null,
  category text not null,
  semantic_color text,
  palette_id uuid,
  seasons text[] not null default '{}',
  retired boolean not null default false,
  rain_ok text not null default 'unknown',
  long_walk_ok text not null default 'unknown',
  memo text,
  acquired_on date,
  notion_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closet_items_name_not_blank check (length(trim(name)) > 0),
  constraint closet_items_category_not_blank check (length(trim(category)) > 0),
  constraint closet_items_rain_ok_values
    check (rain_ok in ('suitable', 'unsuitable', 'unknown')),
  constraint closet_items_long_walk_ok_values
    check (long_walk_ok in ('suitable', 'unsuitable', 'unknown')),
  constraint closet_items_workspace_notion_unique unique (workspace_id, notion_page_id),
  constraint closet_items_id_workspace_unique unique (id, workspace_id),
  constraint closet_items_palette_owner_fkey
    foreign key (palette_id, workspace_id)
    references public.closet_color_palette (id, workspace_id)
    on delete restrict
);

create table public.closet_outfits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  notion_page_id uuid,
  display_name text,
  rating text,
  notion_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closet_outfits_display_name_not_blank
    check (display_name is null or length(trim(display_name)) > 0),
  constraint closet_outfits_rating_values
    check (rating is null or rating in ('favorite', 'ok', 'error')),
  constraint closet_outfits_workspace_notion_unique unique (workspace_id, notion_page_id),
  constraint closet_outfits_id_workspace_unique unique (id, workspace_id)
);

create table public.closet_outfit_items (
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  outfit_id uuid not null,
  item_id uuid not null,
  slot text,
  sort_order smallint not null default 0,
  position_x numeric(7, 4),
  position_y numeric(7, 4),
  scale numeric(6, 4),
  z_index smallint,
  created_at timestamptz not null default now(),
  primary key (workspace_id, outfit_id, item_id),
  constraint closet_outfit_items_slot_values check (
    slot is null or slot in (
      'outer',
      'top',
      'inner',
      'bottom',
      'dress',
      'shoes',
      'bag',
      'socks',
      'accessory'
    )
  ),
  constraint closet_outfit_items_scale_positive
    check (scale is null or scale > 0),
  constraint closet_outfit_items_outfit_owner_fkey
    foreign key (outfit_id, workspace_id)
    references public.closet_outfits (id, workspace_id)
    on delete cascade,
  constraint closet_outfit_items_item_owner_fkey
    foreign key (item_id, workspace_id)
    references public.closet_items (id, workspace_id)
    on delete restrict
);

create table public.closet_places (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  notion_option_id text,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint closet_places_name_not_blank check (length(trim(name)) > 0),
  constraint closet_places_workspace_name_unique unique (workspace_id, name),
  constraint closet_places_id_workspace_unique unique (id, workspace_id)
);

create table public.closet_transport_modes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  notion_option_id text,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint closet_transport_modes_name_not_blank check (length(trim(name)) > 0),
  constraint closet_transport_modes_workspace_name_unique unique (workspace_id, name),
  constraint closet_transport_modes_id_workspace_unique unique (id, workspace_id)
);

create table public.closet_wear_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  notion_page_id uuid,
  outfit_id uuid not null,
  worn_on date not null,
  temp_out smallint,
  temp_back smallint,
  temp_back_inferred boolean not null default false,
  recommendation_temp numeric(4, 1)
    generated always as (
      case
        when temp_out is null then null
        else (temp_out + coalesce(temp_back, temp_out)) / 2.0
      end
    ) stored,
  feeling_out text,
  feeling_back text,
  rain_condition text not null default 'unknown',
  long_walk_condition text not null default 'unknown',
  place_id uuid,
  transport_mode_id uuid,
  memo text,
  temperature_source text not null default 'manual',
  submission_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closet_wear_logs_temperature_out_range
    check (temp_out is null or temp_out between -50 and 60),
  constraint closet_wear_logs_temperature_back_range
    check (temp_back is null or temp_back between -50 and 60),
  constraint closet_wear_logs_feeling_out_values
    check (feeling_out is null or feeling_out in ('cold', 'ok', 'hot')),
  constraint closet_wear_logs_feeling_back_values
    check (feeling_back is null or feeling_back in ('cold', 'ok', 'hot')),
  constraint closet_wear_logs_rain_condition_values
    check (rain_condition in ('no', 'yes', 'unknown')),
  constraint closet_wear_logs_long_walk_condition_values
    check (long_walk_condition in ('no', 'yes', 'unknown')),
  constraint closet_wear_logs_temperature_source_values
    check (temperature_source in ('notion', 'manual', 'weather')),
  constraint closet_wear_logs_inferred_back_requires_out
    check (not temp_back_inferred or temp_out is not null),
  constraint closet_wear_logs_workspace_notion_unique unique (workspace_id, notion_page_id),
  constraint closet_wear_logs_workspace_submission_unique unique (workspace_id, submission_token),
  constraint closet_wear_logs_outfit_owner_fkey
    foreign key (outfit_id, workspace_id)
    references public.closet_outfits (id, workspace_id)
    on delete restrict,
  constraint closet_wear_logs_place_owner_fkey
    foreign key (place_id, workspace_id)
    references public.closet_places (id, workspace_id)
    on delete restrict,
  constraint closet_wear_logs_transport_owner_fkey
    foreign key (transport_mode_id, workspace_id)
    references public.closet_transport_modes (id, workspace_id)
    on delete restrict
);

create table public.closet_replacement_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  notion_page_id uuid,
  name text not null,
  style_identity text,
  notion_created_at timestamptz,
  created_at timestamptz not null default now(),
  constraint closet_replacement_lines_name_not_blank check (length(trim(name)) > 0),
  constraint closet_replacement_lines_workspace_notion_unique unique (workspace_id, notion_page_id),
  constraint closet_replacement_lines_id_workspace_unique unique (id, workspace_id)
);

create table public.closet_replacement_line_items (
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  replacement_line_id uuid not null,
  item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, replacement_line_id, item_id),
  constraint closet_replacement_line_items_line_owner_fkey
    foreign key (replacement_line_id, workspace_id)
    references public.closet_replacement_lines (id, workspace_id)
    on delete cascade,
  constraint closet_replacement_line_items_item_owner_fkey
    foreign key (item_id, workspace_id)
    references public.closet_items (id, workspace_id)
    on delete restrict
);

create table public.closet_item_images (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  item_id uuid not null,
  storage_path text not null,
  variant text not null,
  status text not null default 'pending',
  width_px integer,
  height_px integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closet_item_images_storage_path_not_blank
    check (length(trim(storage_path)) > 0),
  constraint closet_item_images_variant_values
    check (variant in ('original', 'cutout')),
  constraint closet_item_images_status_values
    check (status in ('pending', 'ready', 'error')),
  constraint closet_item_images_dimensions_positive check (
    (width_px is null or width_px > 0)
    and (height_px is null or height_px > 0)
  ),
  constraint closet_item_images_workspace_path_unique unique (workspace_id, storage_path),
  constraint closet_item_images_item_owner_fkey
    foreign key (item_id, workspace_id)
    references public.closet_items (id, workspace_id)
    on delete cascade
);

create table public.closet_outfit_previews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  outfit_id uuid not null,
  storage_path text not null,
  status text not null default 'pending',
  composition_version integer not null default 1,
  width_px integer,
  height_px integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint closet_outfit_previews_storage_path_not_blank
    check (length(trim(storage_path)) > 0),
  constraint closet_outfit_previews_status_values
    check (status in ('pending', 'ready', 'error')),
  constraint closet_outfit_previews_version_positive
    check (composition_version > 0),
  constraint closet_outfit_previews_dimensions_positive check (
    (width_px is null or width_px > 0)
    and (height_px is null or height_px > 0)
  ),
  constraint closet_outfit_previews_workspace_path_unique unique (workspace_id, storage_path),
  constraint closet_outfit_previews_outfit_owner_fkey
    foreign key (outfit_id, workspace_id)
    references public.closet_outfits (id, workspace_id)
    on delete cascade
);

create table public.closet_import_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  source text not null default 'notion',
  status text not null,
  source_snapshot_at timestamptz,
  counts jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint closet_import_runs_source_values check (source in ('notion', 'manual')),
  constraint closet_import_runs_status_values
    check (status in ('running', 'passed', 'failed'))
);

-- Foreign keys are not indexed automatically by Postgres.
create index closet_color_palette_workspace_id_idx on public.closet_color_palette (workspace_id);
create index closet_items_workspace_category_name_idx on public.closet_items (workspace_id, category, name);
create index closet_items_workspace_active_idx on public.closet_items (workspace_id, name)
  where retired = false;
create index closet_items_palette_id_idx on public.closet_items (palette_id);
create index closet_outfits_workspace_rating_idx on public.closet_outfits (workspace_id, rating);
create index closet_outfit_items_workspace_item_idx
  on public.closet_outfit_items (workspace_id, item_id);
create index closet_places_workspace_active_name_idx
  on public.closet_places (workspace_id, active, name);
create index closet_transport_modes_workspace_active_name_idx
  on public.closet_transport_modes (workspace_id, active, name);
create index closet_wear_logs_workspace_worn_on_id_idx
  on public.closet_wear_logs (workspace_id, worn_on desc, id);
create index closet_wear_logs_workspace_outfit_worn_on_idx
  on public.closet_wear_logs (workspace_id, outfit_id, worn_on desc);
create index closet_wear_logs_place_id_idx on public.closet_wear_logs (place_id);
create index closet_wear_logs_transport_mode_id_idx
  on public.closet_wear_logs (transport_mode_id);
create index closet_replacement_lines_workspace_id_idx
  on public.closet_replacement_lines (workspace_id);
create index closet_replacement_line_items_workspace_item_idx
  on public.closet_replacement_line_items (workspace_id, item_id);
create index closet_item_images_workspace_item_idx
  on public.closet_item_images (workspace_id, item_id);
create index closet_outfit_previews_workspace_outfit_idx
  on public.closet_outfit_previews (workspace_id, outfit_id);
create index closet_import_runs_workspace_started_idx
  on public.closet_import_runs (workspace_id, started_at desc);

create view public.closet_outfit_stats
with (security_invoker = true)
as
select
  o.workspace_id,
  o.id as outfit_id,
  count(w.id)::bigint as wear_count,
  max(w.worn_on) as last_worn_on
from public.closet_outfits o
left join public.closet_wear_logs w
  on w.workspace_id = o.workspace_id
 and w.outfit_id = o.id
group by o.workspace_id, o.id;

create view public.closet_item_stats
with (security_invoker = true)
as
select
  i.workspace_id,
  i.id as item_id,
  count(w.id)::bigint as wear_count,
  max(w.worn_on) as last_worn_on
from public.closet_items i
left join public.closet_outfit_items oi
  on oi.workspace_id = i.workspace_id
 and oi.item_id = i.id
left join public.closet_wear_logs w
  on w.workspace_id = oi.workspace_id
 and w.outfit_id = oi.outfit_id
group by i.workspace_id, i.id;

-- Explicit exposure: no Closet Index table is available through the Data API by accident.
revoke all on table
  public.closet_color_palette,
  public.closet_items,
  public.closet_outfits,
  public.closet_outfit_items,
  public.closet_places,
  public.closet_transport_modes,
  public.closet_wear_logs,
  public.closet_replacement_lines,
  public.closet_replacement_line_items,
  public.closet_item_images,
  public.closet_outfit_previews,
  public.closet_import_runs
from anon, authenticated;

revoke all on table
  public.closet_outfit_stats,
  public.closet_item_stats
from anon, authenticated;

grant select on table
  public.closet_color_palette,
  public.closet_items,
  public.closet_outfits,
  public.closet_outfit_items,
  public.closet_places,
  public.closet_transport_modes,
  public.closet_wear_logs,
  public.closet_replacement_lines,
  public.closet_replacement_line_items,
  public.closet_item_images,
  public.closet_outfit_previews,
  public.closet_import_runs,
  public.closet_outfit_stats,
  public.closet_item_stats
to authenticated;

grant update (rain_ok, long_walk_ok, updated_at)
on table public.closet_items to authenticated;

grant insert (
  id,
  workspace_id,
  outfit_id,
  worn_on,
  temp_out,
  temp_back,
  temp_back_inferred,
  feeling_out,
  feeling_back,
  rain_condition,
  long_walk_condition,
  place_id,
  transport_mode_id,
  memo,
  temperature_source,
  submission_token,
  created_at,
  updated_at
) on table public.closet_wear_logs to authenticated;

grant update (
  outfit_id,
  worn_on,
  temp_out,
  temp_back,
  temp_back_inferred,
  feeling_out,
  feeling_back,
  rain_condition,
  long_walk_condition,
  place_id,
  transport_mode_id,
  memo,
  temperature_source,
  updated_at
) on table public.closet_wear_logs to authenticated;

grant delete on table public.closet_wear_logs to authenticated;

alter table public.closet_color_palette enable row level security;
alter table public.closet_items enable row level security;
alter table public.closet_outfits enable row level security;
alter table public.closet_outfit_items enable row level security;
alter table public.closet_places enable row level security;
alter table public.closet_transport_modes enable row level security;
alter table public.closet_wear_logs enable row level security;
alter table public.closet_replacement_lines enable row level security;
alter table public.closet_replacement_line_items enable row level security;
alter table public.closet_item_images enable row level security;
alter table public.closet_outfit_previews enable row level security;
alter table public.closet_import_runs enable row level security;

create policy closet_color_palette_select_member
on public.closet_color_palette
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_items_select_member
on public.closet_items
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_items_update_member
on public.closet_items
for update
to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy closet_outfits_select_member
on public.closet_outfits
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_outfit_items_select_member
on public.closet_outfit_items
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_places_select_member
on public.closet_places
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_transport_modes_select_member
on public.closet_transport_modes
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_wear_logs_select_member
on public.closet_wear_logs
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_wear_logs_insert_member
on public.closet_wear_logs
for insert
to authenticated
with check ((select private.is_workspace_member(workspace_id)));

create policy closet_wear_logs_update_member
on public.closet_wear_logs
for update
to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check ((select private.is_workspace_member(workspace_id)));

create policy closet_wear_logs_delete_member
on public.closet_wear_logs
for delete
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_replacement_lines_select_member
on public.closet_replacement_lines
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_replacement_line_items_select_member
on public.closet_replacement_line_items
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_item_images_select_member
on public.closet_item_images
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_outfit_previews_select_member
on public.closet_outfit_previews
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_import_runs_select_member
on public.closet_import_runs
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));
