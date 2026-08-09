-- P5B keeps actual Wear Log observations on the existing event row because
-- they describe that single wear event. A separate observation table would add
-- a needless one-to-one join and lifecycle. The non-null default intentionally
-- classifies every existing Wear Log as HVAC off; J will correct exceptions in
-- the editor after applying this migration.

alter table public.closet_wear_logs
  add column observed_hvac_mode text not null default 'off',
  add column observed_hvac_intensity text,
  add column observed_hvac_memo text,
  add constraint closet_wear_logs_observed_hvac_mode_check
    check (observed_hvac_mode in ('cooling', 'heating', 'off')),
  add constraint closet_wear_logs_observed_hvac_intensity_check
    check (observed_hvac_intensity is null or observed_hvac_intensity in ('weak', 'normal', 'strong')),
  add constraint closet_wear_logs_observed_hvac_consistency_check
    check (
      (observed_hvac_mode = 'off' and observed_hvac_intensity is null)
      or
      (observed_hvac_mode in ('cooling', 'heating') and observed_hvac_intensity is not null)
    ),
  add constraint closet_wear_logs_observed_hvac_memo_check
    check (observed_hvac_memo is null or btrim(observed_hvac_memo) <> '');

comment on column public.closet_wear_logs.observed_hvac_mode is
  '역할=해당 Wear Log 당일의 실제 HVAC 관측; source_of_truth=수동 기록; lifecycle=LIVE_CORE; cooling/heating/off만 사용하며 기존 행은 의도적으로 off로 초기화';
comment on column public.closet_wear_logs.observed_hvac_intensity is
  '역할=실제 cooling/heating 강도; source_of_truth=수동 기록; lifecycle=LIVE_CORE; weak/normal/strong, off일 때 NULL';
comment on column public.closet_wear_logs.observed_hvac_memo is
  '역할=실제 HVAC 관측 메모; source_of_truth=수동 기록; lifecycle=LIVE_CORE';

grant insert (observed_hvac_mode, observed_hvac_intensity, observed_hvac_memo)
on table public.closet_wear_logs
to authenticated;

grant update (observed_hvac_mode, observed_hvac_intensity, observed_hvac_memo)
on table public.closet_wear_logs
to authenticated;

-- Place kind belongs on the existing Place row: it is one stable taxonomy
-- attribute, not a repeating entity. Only the current row named 기타 is a
-- generic category; all other current and future rows default to specific.

alter table public.closet_places
  add column place_kind text not null default 'specific_venue',
  add constraint closet_places_place_kind_check
    check (place_kind in ('specific_venue', 'generic_category'));

update public.closet_places
set place_kind = 'generic_category'
where name = '기타';

comment on column public.closet_places.place_kind is
  '역할=HVAC Profile 적용 범위 분류; source_of_truth=수동 Place taxonomy; lifecycle=LIVE_CORE; 현재 기타만 generic_category이고 나머지는 specific_venue';

-- Place Profile needs its own live table because one specific venue can have
-- four independently maintained seasonal profiles. Columns on closet_places
-- would duplicate the same field group four times, while JSONB would weaken
-- constraints, RLS visibility, and direct editing. This table is the smallest
-- normalized structure: one row per workspace/place/season, with no RPC,
-- staging, cache, review, or derived-evidence object.

create table public.closet_place_hvac_profiles (
  workspace_id uuid not null
    references public.workspaces (id)
    on delete restrict,
  place_id uuid not null,
  season text not null,
  expected_hvac_mode text not null,
  expected_hvac_intensity text,
  memo text,
  source text not null,
  last_confirmed_on date not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint closet_place_hvac_profiles_pkey
    primary key (workspace_id, place_id, season),
  constraint closet_place_hvac_profiles_place_owner_fkey
    foreign key (place_id, workspace_id)
    references public.closet_places (id, workspace_id)
    on delete cascade,
  constraint closet_place_hvac_profiles_season_check
    check (season in ('Spring', 'Summer', 'Fall', 'Winter')),
  constraint closet_place_hvac_profiles_mode_check
    check (expected_hvac_mode in ('cooling', 'heating', 'off')),
  constraint closet_place_hvac_profiles_intensity_check
    check (expected_hvac_intensity is null or expected_hvac_intensity in ('weak', 'normal', 'strong')),
  constraint closet_place_hvac_profiles_consistency_check
    check (
      (expected_hvac_mode = 'off' and expected_hvac_intensity is null)
      or
      (expected_hvac_mode in ('cooling', 'heating') and expected_hvac_intensity is not null)
    ),
  constraint closet_place_hvac_profiles_memo_check
    check (memo is null or btrim(memo) <> ''),
  constraint closet_place_hvac_profiles_source_check
    check (source in ('manual', 'wear_log_observation'))
);

comment on table public.closet_place_hvac_profiles is
  '역할=specific venue별 계절 HVAC 예상값; source_of_truth=수동 Place Profile; lifecycle=LIVE_CORE; 제거 조건=Place Profile 입력·조회 기능과 모든 소비자를 함께 폐기할 때';
comment on column public.closet_place_hvac_profiles.expected_hvac_mode is
  '역할=해당 장소·계절의 예상 HVAC; source_of_truth=수동 Place Profile; lifecycle=LIVE_CORE';
comment on column public.closet_place_hvac_profiles.expected_hvac_intensity is
  '역할=예상 cooling/heating 강도; source_of_truth=수동 Place Profile; lifecycle=LIVE_CORE; weak/normal/strong, off일 때 NULL';
comment on column public.closet_place_hvac_profiles.source is
  '역할=예상값의 수동 근거 구분; source_of_truth=수동 선택; lifecycle=LIVE_CORE; manual 또는 wear_log_observation';
comment on column public.closet_place_hvac_profiles.last_confirmed_on is
  '역할=예상값을 마지막으로 확인한 날짜; source_of_truth=수동 입력; lifecycle=LIVE_CORE';

create index closet_place_hvac_profiles_place_owner_fk_idx
  on public.closet_place_hvac_profiles (place_id, workspace_id);

revoke all on table public.closet_place_hvac_profiles
from public, anon, authenticated;

grant select on table public.closet_place_hvac_profiles
to authenticated;

grant insert (
  workspace_id,
  place_id,
  season,
  expected_hvac_mode,
  expected_hvac_intensity,
  memo,
  source,
  last_confirmed_on
)
on table public.closet_place_hvac_profiles
to authenticated;

grant update (
  expected_hvac_mode,
  expected_hvac_intensity,
  memo,
  source,
  last_confirmed_on
)
on table public.closet_place_hvac_profiles
to authenticated;

grant select, insert, update, delete
on table public.closet_place_hvac_profiles
to service_role;

alter table public.closet_place_hvac_profiles enable row level security;

create policy closet_place_hvac_profiles_select_member
on public.closet_place_hvac_profiles
for select
to authenticated
using ((select private.is_workspace_member(workspace_id)));

create policy closet_place_hvac_profiles_insert_member
on public.closet_place_hvac_profiles
for insert
to authenticated
with check (
  (select private.is_workspace_member(workspace_id))
  and exists (
    select 1
    from public.closet_places as place
    where place.id = closet_place_hvac_profiles.place_id
      and place.workspace_id = closet_place_hvac_profiles.workspace_id
      and place.place_kind = 'specific_venue'
  )
);

create policy closet_place_hvac_profiles_update_member
on public.closet_place_hvac_profiles
for update
to authenticated
using ((select private.is_workspace_member(workspace_id)))
with check (
  (select private.is_workspace_member(workspace_id))
  and exists (
    select 1
    from public.closet_places as place
    where place.id = closet_place_hvac_profiles.place_id
      and place.workspace_id = closet_place_hvac_profiles.workspace_id
      and place.place_kind = 'specific_venue'
  )
);
