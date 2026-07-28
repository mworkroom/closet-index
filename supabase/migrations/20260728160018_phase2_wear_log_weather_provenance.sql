-- Closet Index Phase 2 W6: keep the minimum KMA provenance on Wear Logs.
-- Existing Notion and manual rows remain valid with null weather metadata.

alter table public.closet_wear_logs
  add column weather_location_id uuid,
  add column weather_issued_at timestamptz,
  add column weather_overridden boolean not null default false,
  add constraint closet_wear_logs_weather_location_owner_fkey
    foreign key (weather_location_id, workspace_id)
    references public.closet_weather_locations (id, workspace_id)
    on delete restrict,
  add constraint closet_wear_logs_weather_provenance_consistency
    check (
      (
        temperature_source = 'weather'
        and weather_location_id is not null
        and weather_issued_at is not null
      )
      or
      (
        temperature_source <> 'weather'
        and weather_location_id is null
        and weather_issued_at is null
        and not weather_overridden
      )
    );

create index closet_wear_logs_weather_location_workspace_fk_idx
  on public.closet_wear_logs (weather_location_id, workspace_id);

grant insert (
  weather_location_id,
  weather_issued_at,
  weather_overridden
) on table public.closet_wear_logs to authenticated;

grant update (
  weather_location_id,
  weather_issued_at,
  weather_overridden
) on table public.closet_wear_logs to authenticated;
