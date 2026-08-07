# Phase 5 Transport Taxonomy Manual Runbook

이 runbook은 기존 `closet_transport_modes`와 `closet_wear_logs.transport_mode_id`를 그대로 사용한다. migration 파일은 만들지 않았다. 아래 Transport taxonomy 전환은 2026-08-08 production에 적용했으며, 적용 결과는 이 문서의 검증 조건으로 확인했다.

## 목표 상태

- 기존 `도보` row: ID를 유지한 채 `도보 · 지속`으로 rename
- 새 row 1개: `도보 · 근거리`
- 새 short row의 stable ID: `7d1fe2dc-47cd-5d4c-9db6-8215e94e42c2`
- 별도 legacy row, Wear Log column, relation, 중복 저장 구조는 만들지 않음

## 1. 적용 전 확인

먼저 다음 SELECT만 실행한다. 대상 workspace UUID, 기존 Walk ID와 reference 수를 기록한다.

```sql
select
  tm.workspace_id,
  tm.id as transport_mode_id,
  tm.name,
  tm.active,
  count(wl.id) as distinct_wear_log_count
from public.closet_transport_modes tm
left join public.closet_wear_logs wl
  on wl.workspace_id = tm.workspace_id
 and wl.transport_mode_id = tm.id
where tm.name in (
  '도보',
  'Walk',
  '도보 · 근거리',
  '도보 · 지속'
)
group by tm.workspace_id, tm.id, tm.name, tm.active
order by tm.workspace_id, tm.name;
```

적용 전 조건:

- 대상 workspace에 legacy Walk row가 정확히 1개여야 한다.
- `도보 · 근거리`와 `도보 · 지속` row가 아직 없어야 한다.
- stable short ID가 다른 row에서 사용 중이면 안 된다.
- 현재 감사 기준 기존 Walk reference는 207건이다. 실제 실행 시 SELECT 결과를 source of truth로 사용한다.

## 2. 적용 SQL

아래 block은 production 적용에 사용한 workspace UUID를 작은따옴표로 감싼 UUID literal로 기록한다. PostgreSQL에서 UUID를 따옴표 없이 쓰면 하이픈이 뺄셈 연산자로 해석될 수 있다.

```sql
do $$
declare
  v_workspace_id constant uuid := '00000000-0000-0000-0000-000000000003';
  v_short_id constant uuid := '7d1fe2dc-47cd-5d4c-9db6-8215e94e42c2';
  v_existing_walk_id uuid;
  v_total_before bigint;
  v_total_after bigint;
  v_walk_refs_before bigint;
  v_walk_refs_after bigint;
begin
  if v_workspace_id is null then
    raise exception 'v_workspace_id를 실제 workspace UUID로 교체해야 합니다.';
  end if;

  select id
    into strict v_existing_walk_id
  from public.closet_transport_modes
  where workspace_id = v_workspace_id
    and name in ('도보', 'Walk');

  if exists (
    select 1
    from public.closet_transport_modes
    where id = v_short_id
       or (
         workspace_id = v_workspace_id
         and name in ('도보 · 근거리', '도보 · 지속')
       )
  ) then
    raise exception 'short ID 또는 새 Transport label이 이미 존재합니다.';
  end if;

  select count(*) into v_total_before
  from public.closet_wear_logs
  where workspace_id = v_workspace_id;

  select count(*) into v_walk_refs_before
  from public.closet_wear_logs
  where workspace_id = v_workspace_id
    and transport_mode_id = v_existing_walk_id;

  update public.closet_transport_modes
  set name = '도보 · 지속'
  where id = v_existing_walk_id
    and workspace_id = v_workspace_id;

  insert into public.closet_transport_modes (
    id,
    workspace_id,
    notion_option_id,
    name,
    active
  ) values (
    v_short_id,
    v_workspace_id,
    null,
    '도보 · 근거리',
    true
  );

  select count(*) into v_total_after
  from public.closet_wear_logs
  where workspace_id = v_workspace_id;

  select count(*) into v_walk_refs_after
  from public.closet_wear_logs
  where workspace_id = v_workspace_id
    and transport_mode_id = v_existing_walk_id;

  if v_total_after <> v_total_before then
    raise exception 'Wear Log 총수가 변경되었습니다: % -> %',
      v_total_before, v_total_after;
  end if;

  if v_walk_refs_after <> v_walk_refs_before then
    raise exception '기존 Walk reference 수가 변경되었습니다: % -> %',
      v_walk_refs_before, v_walk_refs_after;
  end if;
end
$$;
```

이 block은 Wear Log를 update하지 않는다. 기존 Walk ID를 참조하던 모든 기록은 같은 ID를 계속 참조하며, 표시 label만 `도보 · 지속`으로 바뀐다.

## 3. 적용 후 검증

2026-08-08 production 검증 결과:

- `도보 · 지속`: 기존 ID `ce3531e8-584c-5820-b777-92465d6b5128`, Wear Log 207건
- `도보 · 근거리`: 신규 ID `7d1fe2dc-47cd-5d4c-9db6-8215e94e42c2`, Wear Log 0건
- legacy `도보`/`Walk` row: 0개
- workspace 전체 Wear Log: 적용 전후 모두 783건

1단계 SELECT를 다시 실행하고 다음을 확인한다.

- `도보 · 지속`의 ID가 적용 전 기존 Walk ID와 같다.
- `도보 · 근거리`의 ID가 `7d1fe2dc-47cd-5d4c-9db6-8215e94e42c2`다.
- `도보 · 지속` reference 수가 적용 전 기존 Walk reference 수와 같다.
- `도보 · 근거리` reference 수는 editor QA 전 0건이다.
- workspace의 전체 Wear Log 수가 적용 전과 같다.
- 15건의 short 재지정 후 read-only taxonomy audit의 예상 분포는 `도보 · 근거리` 15건, `도보 · 지속` 192건이며 합계 207건이다.

그 다음 앱 snapshot을 새로고침하고 Transport 선택 순서가 다음인지 확인한다.

1. `도보 · 근거리`
2. `도보 · 지속`
3. `차`
4. `지하철`
5. `버스`

## 4. Rollback

Rollback은 새 short row를 참조하는 Wear Log가 **0건일 때만** 허용한다. 15건의 short QA 재분류를 시작한 뒤에는 이 block이 의도적으로 실패하며, 자동 bulk reassignment는 하지 않는다.

`v_workspace_id`의 `null`을 실제 workspace UUID로 교체한다.

```sql
do $$
declare
  v_workspace_id constant uuid := null; -- 실제 workspace UUID로 교체
  v_short_id constant uuid := '7d1fe2dc-47cd-5d4c-9db6-8215e94e42c2';
  v_sustained_id uuid;
  v_short_refs bigint;
begin
  if v_workspace_id is null then
    raise exception 'v_workspace_id를 실제 workspace UUID로 교체해야 합니다.';
  end if;

  select id
    into strict v_sustained_id
  from public.closet_transport_modes
  where workspace_id = v_workspace_id
    and name = '도보 · 지속';

  select count(*) into v_short_refs
  from public.closet_wear_logs
  where workspace_id = v_workspace_id
    and transport_mode_id = v_short_id;

  if v_short_refs <> 0 then
    raise exception '도보 · 근거리 reference가 %건이므로 rollback할 수 없습니다.',
      v_short_refs;
  end if;

  delete from public.closet_transport_modes
  where id = v_short_id
    and workspace_id = v_workspace_id
    and name = '도보 · 근거리';

  if not found then
    raise exception '삭제할 도보 · 근거리 row를 찾지 못했습니다.';
  end if;

  update public.closet_transport_modes
  set name = '도보'
  where id = v_sustained_id
    and workspace_id = v_workspace_id;
end
$$;
```

Rollback 후 1단계 SELECT를 다시 실행해 기존 Walk ID와 reference 수가 보존되고 short row가 없는지 확인한다.

## 5. 이번 production 적용에서 하지 않은 일

- migration 생성 또는 수정
- 15건 short 기록의 자동 reassignment
- 1건 sustained 기록의 불필요한 update
- `walk_unclassified` production option 생성
- Policy B 활성화
