# Closet Index Database Cleanup Plan

- 작성일: 2026-08-05
- 근거 문서: [`database-map.md`](./database-map.md)
- 현재 단계: Outfit Preview subsystem, Outfit clone RPC, Import Runs Wave 1 production cleanup 완료. 다음 cleanup 후보는 live dependency와 local/remote migration history 차이를 다시 inventory한 뒤 결정한다.

## 1. 목적과 원칙

이 계획의 목표는 table 수를 무조건 줄이는 것이 아니라, 현재 앱의 source of truth를 J가 SQL로 이해할 수 있는 범위에 두는 것이다.

1. production cleanup 전 원본 export, row count, checksum, dependency 목록을 남긴다.
2. 현재 UI가 읽거나 쓰는 object는 “행이 적다”는 이유만으로 제거하지 않는다.
3. 일회성 migration 보조 구조는 역할이 끝나면 code, RPC, trigger, table 순으로 subsystem 전체를 정리한다.
4. cleanup migration은 wave별로 분리하고, 적용 전후 검증과 rollback 절차를 작성한다.
5. export에는 개인 데이터가 포함될 수 있으므로 Git에 올리지 않는다.
6. 이 문서 작성 단계에서는 `DROP`, `DELETE`, `UPDATE`, backfill을 수행하지 않는다.

## 2. 현재 결론

| 질문 | 결론 |
|---|---|
| 즉시 안전하게 제거 가능한 DB object | Preview subsystem은 frontend·DB·Storage·Edge Function까지 제거 완료. `clone_closet_outfit`도 client 선행 배포와 exact cleanup migration 검증 뒤 production에서 제거 완료 |
| 가장 독립적인 후보 | `closet_import_runs` Wave 1 제거 완료. 다음 단위는 Legacy Link의 초기 이관용 client surface와 importer 제거 |
| 현재 dependency 때문에 제거할 수 없는 후보 | Legacy Link DB subsystem. confirmed edge 18개와 reverse·validation 계약이 아직 의존한다. Preview DB dependency는 제거 완료 |
| Outfit Preview 결정 | J가 영구 제거를 확정. frontend·Function 전환과 DB cleanup 완료 |
| Outfit clone RPC 결정 | 현재 복제 UX는 source-prefill 뒤 일반 create 경로를 사용한다. client dead code와 production RPC를 제거했으며, 일반 create가 공유하는 private helper는 유지 |
| Line 색상 자동 분류 | 일회성 초기 제안으로만 사용하고 직접 지정 완료 후 제거 권장 |

`closet_import_runs`는 DB FK·trigger·RPC dependency가 없음을 적용 직전에 다시 확인하고, 2행 fingerprint와 local-only export·restore를 대조한 뒤 production에서 제거했다. table·policy·index 부재, 핵심 데이터 checksum 불변, 활성 Outfit RPC와 Advisor 불변을 확인했으며 rollback 자료는 복구용으로 보존한다.

## 3. Cleanup Wave 1 — Import Runs

### 대상

- `public.closet_import_runs` 2행
- 제거한 `scripts/import-supabase.mjs`와 `notion:import` package command
- 관련 schema test와 문서

### 선행 작업

1. [x] 두 row를 `data/local-exports/` 아래 JSON으로 local-only export했다.
2. [x] row count 2, `started_at, id` 정렬, UTC 생성 시각, 파일 SHA-256 `a83f46581ecc7b6671cebc901d20a76b04f22549fe490a702a27d4ab88feaf5c`를 별도 manifest에 기록했다.
3. [x] production이 snapshot 이후 증가했고 stable-ID upsert가 과거 값을 덮을 수 있어 historical import를 다시 실행하지 않기로 결정했다.
4. [x] `scripts/import-supabase.mjs`와 `notion:import` package command를 제거했다. ignored 원본 snapshot은 삭제하지 않았다.
5. [x] `rg`와 production catalog로 frontend, RPC, view, trigger, cron, publication, Edge Function dependency가 0인지 재확인했다.
6. [x] exact `DROP TABLE` migration과 schema rollback SQL을 작성했다. drift와 예상하지 못한 dependency가 있으면 중단되도록 `IF EXISTS`와 `CASCADE`를 사용하지 않았다.
7. [x] local-only data restore SQL을 만들고 2행·production row fingerprint를 transaction 안에서 검증하도록 했다. restore SQL SHA-256은 `9adc648c3a60a3d79a0c88ad6d215b3968f0b055f21c9a2db44cda35d07519c6`이다.
8. [x] Phase 1 기대값을 retained schema에 맞추고 table 제거·활성 schema 보존·schema rollback을 검증하는 pgTAP을 작성했다.
9. [x] 빈 PostgreSQL 17 환경에서 전체 migration 뒤 8개 파일·137개 pgTAP, schema rollback 뒤 1개 파일·14개 pgTAP을 run `32799664883`에서 통과시켰다.
10. [x] 적용 직전 production row fingerprint와 dependency·lock을 다시 읽고 exact migration을 remote version `20260825021515`로 적용했다.

export, manifest, data restore SQL은 개인 데이터가 포함된 local-only 자료이므로 Git에 올리지 않는다. schema rollback은 복구 가능한 구조를 코드로 검토할 수 있도록 추적하며, production 제거 후에도 rollback 보존 기간 동안 함께 유지한다.

### cleanup migration 준비 범위

- migration `20260825021515_remove_closet_import_runs.sql`은 `DROP TABLE public.closet_import_runs` 한 문장만 실행했다. table 소유 index·policy·grant·constraint는 PostgreSQL의 table 제거 경계 안에서 함께 제거됐다.
- `remove_closet_import_runs_rollback.sql`은 감사한 9개 column, constraint, index, grant, RLS policy와 lifecycle COMMENT를 복구한다. production 2행 복구는 별도 ignored restore SQL로 분리한다.
- cleanup contract 5개 assertion은 제거 대상 부재와 active Item·Outfit·Wear Log table, 일반 Outfit create RPC 보존을 검증한다.
- rollback contract 14개 assertion은 schema·권한·RLS·COMMENT 복구와 빈 data 경계를 검증한다.

### 완료 검증

- [x] `closet_items` 455행, `closet_outfits` 517행, `closet_outfit_items` 2,443행, `closet_wear_logs` 807행과 각 전체-row SHA-256이 적용 전후 동일하다.
- [x] table regclass, RLS policy, workspace/start index가 모두 부재한다.
- [x] 일반 Outfit create/update RPC와 private helper의 definition MD5·권한이 적용 전후 동일하다.
- [x] import script가 존재하지 않는 table을 호출하지 않는다.
- [x] Security Advisor 47건, Performance Advisor 33건이 byte 단위로 동일하고 대상 관련 항목은 전후 0건이다.
- [x] remote version과 맞춘 local migration 이력으로 앱 test 645개, production build와 Pages artifact 검증을 통과시켰다.
- [x] 빈 PostgreSQL 17에서 cleanup 8개 파일·137 assertions와 schema rollback 1개 파일·14 assertions를 run `32801422031`로 통과시켰다.
- [x] Pages build·deploy run `32801409718`을 통과시키고 공개 URL의 HTTP 200과 앱 shell을 확인했다.

## 4. Cleanup Wave 2 — Outfit Preview subsystem

### 결정과 production 기준선

- `closet_outfit_previews`: 2행, 모두 ready.
- 초기 production frontend는 Preview를 생성·조회했다.
- 초기 production DB에는 stale trigger 두 개, public preview RPC 세 개와 Storage policy dependency가 있었다.
- J는 저장 Preview를 사용하지 않기로 확정했다.
- 현재 production frontend는 Item cutout을 즉시 합성하고, cutout이 하나도 없을 때만 색상 swatch를 표시한다.
- production Outfit 삭제는 Preview 업로드 Function에서 분리한 `closet-outfit-delete` Function과 Wear Log 보호 RPC를 사용한다.

안전 순서에 따라 새 Function과 frontend를 먼저 배포한 뒤 DB cleanup migration을 적용했다. 현재 table·RPC·trigger·policy dependency는 제거됐고 DB와 frontend는 Preview-free 상태다.

### 확정한 답

1. 저장 Preview 대신 `outfit_items + item_images` 즉시 합성을 사용한다.
2. Preview 상태 필터와 업로드 실패 UX는 제거한다.
3. 기존 Preview Storage object 2개는 보존하지 않고 production에서 삭제했다.
4. Outfit의 Wear Log 삭제 차단과 workspace 권한 검사는 계속 유지한다.

### 제거 순서

1. [x] UI를 dynamic composition 단일 경로로 바꾸고 preview 상태 필터를 제거한다.
2. [x] `OutfitCreatorPage`, DataContext, repository, types에서 `replaceOutfitPreview` 계약을 제거한다.
3. [x] Outfit 삭제를 `closet-outfit-delete` Edge Function으로 분리하고 Wear Log 보호 RPC를 유지한다.
4. [x] local `closet-outfit-preview` Edge Function과 preview script를 제거한다.
5. [x] stale trigger·private helper·preview RPC·table·Storage policy dependency 제거 migration을 작성한다.
6. [x] 관련 frontend tests, pgTAP 계약, CI 목록을 갱신한다.
7. [x] `closet-outfit-delete` Function과 새 frontend를 production에 배포하고 실제 삭제 차단·성공을 검증한다.
8. [x] 기존 Preview Storage object 2개와 Dashboard placeholder 폴더를 삭제하고 `/outfits/` object count 0을 확인한다.
9. [x] Preview cleanup·Line color·COMMENT migration을 적용하고 table·RPC·trigger·policy dependency가 0인지 확인한다.
10. [x] 기존 production `closet-outfit-preview` Function을 제거하고 Function 목록이 3개인지 확인한다.

### production 적용 중단 조건

- 새 공개 앱이 `closet_outfit_previews` 또는 old Function을 계속 호출함
- `closet-outfit-delete`의 인증·Wear Log 차단 검증이 실패함
- Storage object 2개를 정확히 식별하지 못함

이 경우 production table과 old Function은 유지하고 원인을 고친 뒤 다시 진행한다.

## 5. Cleanup Wave 3 — Legacy Link subsystem

### 현재 사실

- 2026-08-26 production 재감사에서 Legacy Link 49개는 모두 reviewed다. 판단은 `a_to_b` 8개, `b_to_a` 37개, `parallel` 1개, `not_replacement` 3개다.
- revision은 51개이고 49개 Link 모두 이력이 있다. 여러 revision을 가진 Link는 1개이며 최대 revision number는 3이다. orphan revision은 0개다.
- 현재 confirmed edge 119개 중 manual 101개, `source_kind = legacy_link` 18개다. 18개 모두 source contract, Link 존재·workspace, reviewed directional 판단, predecessor/successor 방향이 일치하고 `needs_review` edge는 0개다.
- reviewed directional Link는 45개다. 이 중 18개만 현재 Legacy 출처 edge를 가지며 27개는 가지지 않는다. 45개 모두 두 Item이 공유하는 Line이 정확히 1개라 과거 preview 계산에서는 `ready`이고, 비방향 판단 4개는 `excluded`다.
- edge preview는 active edge가 하나라도 있으면 초기 일괄 확정을 잠근다. 현재 active edge가 119개이므로 저장 경로는 항상 차단되며, 27개를 현재 graph에 자동 추가해야 할 미완료 queue로 해석하지 않는다.
- 2026-08-26 client-first cleanup에서 `/replacement-lines/review`, `/replacement-lines/edges/preview`, 구 Statistics redirect 두 개와 review/preview UI·repository 계약·importer를 제거했다. 현재 frontend는 Legacy table과 review/confirm RPC를 읽거나 호출하지 않는다.
- production DB에는 연결된 18개 판단을 바꾸면 `mark_legacy_link_edge_needs_review` trigger가 edge를 `needs_review`로 바꾸는 계약이 남아 있다. Lineage의 reverse RPC도 Legacy 출처 edge에서는 판단과 revision을 함께 갱신한다.
- production에는 Legacy와 직접 연결된 `SECURITY DEFINER` 함수 7개, Legacy table trigger 1개, edge validation trigger/function 1개, edge source FK·두 source column·관련 constraint/index가 남아 있다. Legacy table 두 개의 RLS와 authenticated SELECT도 유지된다.
- `track_functions = none`이므로 함수 호출 누적치는 얻을 수 없다. 최근 24시간 API·Postgres 로그의 관련 table/RPC exact match는 0건이지만, 짧은 관측 구간의 보조 증거일 뿐 미사용의 단독 근거로 삼지 않는다.

현재 결론은 **초기 review/preview client workflow 제거는 끝났지만 DB subsystem은 아직 제거할 수 없다**는 것이다. 공개 bundle에서 제거 상태를 확인한 뒤 export와 18개 edge 전환을 별도 단계로 수행한다.

### 선행 export

다음 세 자료를 같은 snapshot 시각으로 local-only export한다.

1. Legacy Link 49개 전체
2. revision 51개 전체
3. Legacy 출처 edge 18개와 연결된 Line·Item 이름 lookup

각 export에는 row count, 정렬 기준, timestamp, SHA-256을 기록한다. 사람 읽기용 CSV와 관계 보존용 JSON을 함께 두는 편이 안전하다.

2026-08-26 읽기 전용 기준선에서 source field를 제외한 현재 계보 의미 SHA-256은 전체 119개 edge `cd7fb6c8edc608828193c9f9d3a4bea1f5814978b1c61b73b3ec8ece52caea83`, Legacy 출처 18개 `2b68666896b01001b8a1b3ec1e8c9964222aa3bdd368ca2bca580e24c8164018`이다. 실제 export 직전에는 같은 정렬·column 계약으로 다시 계산한다.

### Legacy edge 전환

1. 18개 edge마다 predecessor, successor, Line, branch, decision reason이 현재 UI와 일치하는지 확인한다.
2. 별도 migration에서 `source_kind = 'manual'`, `source_legacy_link_id = null`로 전환한다.
3. 전환 전후 18개 edge의 ID·방향·설명·Line·확정 metadata checksum이 동일한지 검증한다.
4. 모든 edge가 Legacy table 없이 reverse/edit/disconnect 가능한지 인증 fixture로 확인한다.
5. reverse RPC에서 Legacy decision/revision 갱신 분기를 제거하고 edge 자체만 안전하게 반전하도록 단순화한다.

이 단계는 production `UPDATE` backfill이므로 client-first cleanup에서는 수행하지 않는다.

### UI와 code 제거

- [x] `/replacement-lines/review`
- [x] `/replacement-lines/edges/preview`
- [x] `/statistics/replacement-lines/review`, `/statistics/replacement-lines/edges/preview` compatibility redirect
- [x] `ReplacementLegacyLinkReviewPage`
- [x] `ReplacementLineageEdgePreviewPage`
- [x] Legacy status/progress UI와 관련 CSS
- [x] repository의 `loadLegacyLinks`, `reviewLegacyLink`, `confirmEdges`
- [x] edge client model의 `sourceLegacyLinkId`, `sourceKind`와 Supabase SELECT mapping
- [x] Legacy 전용 types, feature helpers, tests, `import:legacy-links` command와 importer script

Lineage의 manual edge 편집, 시작점, 이동, 병합, 보관 기능은 유지한다.

client source cleanup은 완료했고 DB보다 먼저 배포한다. 현재 Lineage reverse 호출은 edge ID와 optimistic-lock timestamp만 RPC에 보내므로 client가 source column을 읽지 않아도 production DB의 18개 Legacy 분기는 계속 동작한다. 공개 JavaScript에서 두 route와 review/confirm RPC 문자열이 0건인지 확인하기 전에는 DB 전환을 시작하지 않는다.

### DB 제거 순서

1. `mark_legacy_link_edge_needs_review` trigger와 private helper 제거
2. confirm/review/revise Legacy RPC 제거
3. `reverse_closet_replacement_line_edge`의 Legacy dependency가 없는 새 버전 적용
4. edge의 Legacy source FK와 불필요한 source column/index 정리
5. revision table 제거
6. Legacy Link table 제거
7. policies, grants, contract tests 정리

`source_kind`와 `source_legacy_link_id`는 전환 뒤 모든 edge가 manual이므로 단순히 nullable history field로 보존하지 않는다. client 선행 배포와 18개 의미 checksum 검증을 통과한 뒤 FK·source 전용 constraint/index와 함께 제거한다.

### 완료 검증

- Legacy FK를 가진 edge 0개
- edge 총수·방향·Line별 graph checksum 불변
- Lineage UI의 create/edit/reverse/disconnect/start/move/merge/archive 동작 통과
- Legacy route와 RPC가 404 또는 undefined 상태가 아니라 code와 schema에서 완전히 사라짐
- export를 통해 과거 판단을 필요할 때 사람이 다시 읽을 수 있음

## 6. Line 색상 직접 지정과 자동 분류 종료

이 항목은 Outfit Preview production cleanup과 함께 적용했다. 새 subsystem은 만들지 않았다.

구현·production 적용 구조:

- [x] `closet_replacement_lines`에 사람이 읽을 수 있는 nullable `color_category` 하나를 추가하는 migration 작성
- [x] workspace membership과 `updated_at`을 다시 검사하는 전용 update RPC 작성
- [x] Line 관리 UI에서 20개 category를 명시적으로 선택·수정하고 자동 제안으로 초기화
- [x] 직접 값이 있으면 자동 분류보다 우선
- 기존 53개 Line을 채우는 동안에만 현재 frontend 자동 분류와 Item 팔레트 HEX를 initial suggestion과 tile 표시 보조로 사용
- active Line 직접 값 100%와 화면 QA를 확인한 뒤 자동 분류 helper와 이름 기반 규칙 제거

자동 분류 결과 history, confidence, migration run table이나 별도 Line color category table은 만들지 않았다. production migration과 공개 UI 저장·초기화 검증을 완료했으며, 기존 53개 Line은 J가 앱에서 천천히 직접 지정할 수 있다. category 이름을 여러 Line에서 일괄 관리해야 하는 실제 요구가 생길 때만 별도 사전을 재검토한다.

## 7. Cleanup Wave 4 — Outfit clone RPC

### 감사 범위와 결론

2026-08-24에 local source, `origin/main`, production catalog·사용량, remote Edge Function, 공개 GitHub Pages 산출물을 읽기 전용으로 대조했다. 결론은 `public.clone_closet_outfit(uuid, uuid, uuid, text)`과 그 client wrapper가 현재 제품 동작에는 필요하지 않은 cleanup 후보라는 것이다. 당시 공개 JavaScript에는 wrapper가 남아 있어 DB 함수 제거를 보류했고, 2026-08-25에 compatible client 배포와 공개 자산의 참조 0건을 확인한 뒤 exact cleanup migration을 production에 적용했다.

현재 복제 UX는 `OutfitDetailPage`가 `/outfits/new?source=<id>`로 이동하고 `OutfitCreatorPage`가 원본 이름·Item·배치를 미리 채운 뒤 일반 `createOutfit`/`create_closet_outfit` 경로로 새 Outfit을 저장한다. 제품 UI에서 `cloneOutfit`을 호출하는 경로는 없었다. 2026-08-24 감사 당시 concrete Demo·Supabase repository와 Phase 3 계약 테스트에만 남아 있던 clone client 계약은 2026-08-25 cleanup에서 제거했고, 활성 일반 create 계약은 유지했다.

### production 기준선

| 확인 항목 | 2026-08-24 기준 / 2026-08-25 적용 직전 재확인 |
|---|---|
| live 함수 | OID 34723, `SECURITY DEFINER`, `search_path = ''`, definition MD5 `aec3ed94d2b11791cd7a4e10d5825b61` |
| 권한 | `authenticated`, `postgres`, `service_role`에 EXECUTE. `anon`·`PUBLIC` grant 없음 |
| 직접 dependency | `plpgsql`, `public` schema, 반환형 `closet_outfits`만 존재 |
| 역방향 DB dependency | `pg_depend` 0건. 다른 일반 함수, view, materialized view, rule, trigger, RLS policy의 정의 참조도 0건 |
| remote Edge Function | 활성 Function 3개 전체에서 참조 0건 |
| 측정 가능한 사용량 | `pg_stat_statements` reset 시각인 2026-07-18 11:29 UTC 이후 clone의 PostgREST/runtime statement 0건. 같은 구간 create 13건, update 43건 |
| 통계 보존 상태 | `pg_stat_statements_info.dealloc = 0`이라 측정 구간의 statement eviction 없음. `track_functions = none`이므로 함수 통계가 아니라 statement 통계를 근거로 사용 |
| 최근 로그 보조 확인 | API·Postgres 최근 24시간 로그에서 clone/create/update RPC 이름의 exact match 0건. 이 결과는 24시간 범위의 보조 증거로만 사용 |
| 공개 앱 산출물 | 2026-08-24 기준 두 문자열이 각각 1회 포함됐으나, 2026-08-25 client 배포 후 service worker가 참조하는 JavaScript 61개 전체에서 두 문자열 모두 0건. 일반 create RPC와 `source=` 경로는 유지됨 |
| Security Advisor | clone RPC에 `authenticated_security_definer_function_executable` 경고 1건. 제거 대상 함수 자체에만 해당하며 production 제거 후 소멸 여부를 비교할 기준선으로 보존 |

활성 `public.create_closet_outfit`도 `private.create_closet_outfit_record`를 사용한다. 따라서 clone RPC를 제거할 때 private helper는 함께 제거하거나 변경하지 않는다.

### export와 rollback 기준선

이 함수는 독립적인 row를 소유하지 않으므로 table data export 대상은 없다. schema 복구 자료는 다음 세 곳에 이미 보존되어 있다.

1. 적용된 migration `supabase/migrations/20260729000405_phase3_item_outfit_write_contract.sql`의 원본 definition·grant
2. `supabase/rollback/remove_outfit_clone_rpc_rollback.sql`의 2026-08-25 live definition·grant·COMMENT 복구 SQL
3. 이 문서의 live signature·OID·권한·definition MD5 기준선

2026-08-25 cleanup migration 작성 직전에 live `pg_get_functiondef`, ACL, COMMENT, MD5를 다시 대조해 이전 기준선과 동일함을 확인했다. migration 이력은 삭제하거나 고쳐 쓰지 않고 새 cleanup migration만 추가한다.

### 안전한 제거 순서

1. [x] `OutfitCloneInput`, `OutfitCloneRepository`, Demo·Supabase `cloneOutfit` method와 facade 위임, 현재 동작을 대표하지 않는 clone concrete test를 제거한다.
2. [x] Phase 3 pgTAP에서 clone RPC 생성·권한·동작 기대를 제거하고 source-prefill 결과도 일반 create RPC로 저장하는 활성 계약만 남긴다.
3. [x] 전체 test, TypeScript, production build, Pages 산출물 검증을 통과시킨다.
4. [x] client cleanup을 먼저 commit·push·배포한다.
5. [x] 공개 JavaScript에서 `clone_closet_outfit`과 clone 오류 문자열이 0건인지 확인한다.
6. [x] 로그인 세션에서 source-prefill → 일반 create 초안 복제 UX를 smoke test한다. 저장 버튼은 누르지 않고 원본 불변 상태를 확인한다.
7. [x] 정확한 signature만 DROP하는 cleanup migration, live definition 복구 SQL, 함수 부재와 create helper 보존을 검증하는 pgTAP을 준비하고 격리 CI를 통과시킨다.
8. [x] production에 cleanup migration을 적용한 뒤 lifecycle 문서·database map을 제거 완료 상태로 갱신한다. `private.create_closet_outfit_record`는 유지한다.
9. [x] production 함수·grant 부재, 데이터 checksum 불변, create/update RPC transaction 동작과 advisor 변화를 검증한다.

### client cleanup·배포 결과

- client source와 활성 제품 계약에서 `OutfitCloneInput`, `OutfitCloneRepository`, `cloneOutfit`, `clone_closet_outfit` 참조가 0건이다. 과거 migration, cleanup pgTAP, rollback과 감사 문서의 historical/schema 참조만 복구·회귀 근거로 보존한다.
- 기존 Demo clone+archive 테스트는 archive가 relation·rating을 바꾸지 않는 현재 책임만 검증하도록 정리했다.
- source-prefill 화면 테스트는 원본 Item·placement를 초안으로 복사하고, Item을 변경한 새 UUID를 `createOutfit`으로 저장하며, 원본이 불변임을 계속 검증한다.
- Phase 3 pgTAP은 35개 assertion과 `plan(35)`가 일치하며 clone invocation 대신 `create_closet_outfit`으로 독립 relation을 만드는 계약을 검증한다. 로컬 Supabase가 실행 중이지 않아 pgTAP 실제 실행은 DB 연결 단계에서 중단됐고 production DB에는 실행하지 않았다.
- 집중 테스트 11건과 TypeScript 검사, 전체 테스트 652건 중 645건 통과·7건 건너뜀·실패 0건을 확인했다.
- GitHub Pages 조건 build와 SPA fallback 검증을 통과했다. 로컬 production JavaScript의 clone RPC·오류 문자열은 각각 0건이며 create RPC·source query는 각각 1건이다.
- client cleanup commit `fa01da6`과 CI 안정화 commit `78846a4`를 배포했고, 공개 service worker가 참조하는 JavaScript 61개 전체에서 clone RPC·오류 문자열 0건을 확인했다.
- 실제 공개 로그인 화면은 정상 렌더링됐고 console warning·error는 0건이었다. 사용할 수 있는 로그인 세션과 Chrome·Edge 연동이 없어 인증 후 source-prefill 상호작용은 실행하지 않았으며, 해당 동작은 통과한 `OutfitCreatorPage` 격리 테스트로만 확인된 상태다.

### cleanup migration 준비 결과

- 2026-08-25 production 재감사에서 exact overload 1개, OID `34723`, definition MD5 `aec3ed94d2b11791cd7a4e10d5825b61`, `SECURITY DEFINER`, 빈 `search_path`, ACL과 lifecycle COMMENT가 2026-08-24 기준선과 동일했다.
- 직접 dependency는 언어·schema·반환형 3개뿐이고 역방향 dependency, 다른 routine·view·materialized view·rule·trigger·RLS policy, 활성 Edge Function 3개의 참조는 모두 0건이었다.
- `pg_stat_statements`의 clone 관련 4회는 최초 `CREATE`, `REVOKE`, `GRANT`, `COMMENT` DDL뿐이었다. 2026-07-18 reset 이후 PostgREST/runtime clone은 0건이며 같은 구간 create 13건, update 43건이 확인됐다.
- production 이력과 맞춘 migration `20260824180057_remove_outfit_clone_rpc.sql`은 exact signature 1개만 `DROP`하고 `IF EXISTS`·`CASCADE`를 쓰지 않는다. 별도 rollback은 live definition·권한·COMMENT를 복원한다.
- 첫 격리 run `32758052647`에서 새 cleanup pgTAP 6건은 통과했지만, 기존 Phase 3 assertion 1건이 현재 `rating NOT NULL DEFAULT 'ok'` 계약 대신 과거 NULL을 기대해 실패했다. 제품이나 migration을 바꾸지 않고 기대값만 현재 계약에 맞췄다.
- 후속 run `32758392803`에서 빈 PostgreSQL 17 DB에 전체 migration을 적용한 뒤 6개 파일·97개 pgTAP이 모두 통과했고 컨테이너도 정리됐다. Pages run `32758376889`도 test·build·artifact·deploy를 통과했다.
- production DB에 remote version `20260824180057`, name `remove_outfit_clone_rpc`로 cleanup migration을 적용했다.

### production 적용·검증 결과

- 적용 직전 exact overload는 1개였고 OID `34723`, definition MD5 `aec3ed94d2b11791cd7a4e10d5825b61`, ACL, lifecycle COMMENT, 빈 `search_path`가 기준선과 동일했다. 역방향 dependency와 다른 schema object 참조는 0건이었으며, `pg_stat_statements`의 4건은 모두 최초 DDL이고 runtime clone 호출은 0건이었다.
- `DROP FUNCTION public.clone_closet_outfit(uuid, uuid, uuid, text)` 한 문장만 Supabase migration으로 적용했다. 적용 후 exact regprocedure와 동일 이름 overload는 모두 0건이며 remote migration 이력은 65개가 됐다.
- 적용 전후 `closet_outfits` 517행, `closet_outfit_items` 2,443행, `closet_wear_logs` 807행과 각 전체-row checksum이 동일했다.
- 일반 `create_closet_outfit`, `update_closet_outfit_with_rating`, `private.create_closet_outfit_record`의 definition MD5와 권한은 적용 전후 동일했다. 기존 멤버십·Item 구성을 사용한 transaction probe에서 새 Outfit header 1개와 relation 8개 생성, rating update가 성공했고 전부 rollback했다. rollback 뒤 row count와 checksum도 다시 동일했다.
- Security Advisor는 48건에서 47건으로 줄었고 제거 대상에만 해당하던 `authenticated_security_definer_function_executable` 1건이 사라졌다. Performance Advisor는 33건으로 동일하며 clone 관련 항목은 전후 0건이다.
- 로그인된 공개 앱에서 실제 Outfit 상세의 `새로 만들기`를 열어 source query, 복제 안내, 이름, 선택 Item 5개와 각 Item의 좌표·크기·표시 방식이 원본 편집 화면과 모두 동일함을 확인했다. 저장 버튼은 누르지 않았고 `저장 완료` 표시도 없었다. 원본 상세는 평가, Item 수, 착용 횟수가 이전과 같은 상태로 다시 렌더링됐으며 모든 확인 화면의 console warning·error는 0건이었다.
- in-app browser의 screenshot API는 화면을 표시한 뒤에도 두 번 캡처에 실패해 이미지 artifact는 남기지 못했다. URL, DOM snapshot, locator별 값 비교, console log와 실제 열린 clone 초안 탭을 기능 검증 근거로 사용했다.

### 적용 전 중단 조건

- 공개 JavaScript에 clone RPC 또는 clone 오류 문자열이 남아 있음
- 새 runtime usage가 1건이라도 확인됨
- DB·Edge Function dependency가 새로 발견됨
- source-prefill → create 복제 UX가 실패함
- cleanup migration이 clone signature 외 helper나 data object를 변경함

client cleanup 단계에서는 production DB를 변경하지 않았고, 이후 별도 production migration 단계에서 exact RPC만 제거했다. 검증용 create/update는 한 transaction 안에서 rollback해 영구 row를 남기지 않았다.

## 8. 예상 변경 파일

### Preview local cleanup에서 추가로 변경한 영역

- `supabase/migrations/20260804213423_remove_outfit_preview_subsystem.sql`
- `supabase/functions/closet-outfit-delete/**`
- `src/data/image-assets.ts`, repository·snapshot·context·types
- `src/pages/OutfitCreatorPage.tsx`, `src/pages/LookbookPage.tsx`, `src/components/OutfitVisual.tsx`
- Preview 전용 scripts·Function·tests 제거와 pgTAP·CI 갱신
- database map, cleanup plan, Phase 4 plan, devlog

### 향후 cleanup에서 변경될 가능성이 높은 영역

- `supabase/migrations/*_cleanup_*.sql`
- `supabase/functions/closet-outfit-delete/**`
- `src/data/image-assets.ts`
- `src/data/repository.ts`
- `src/data/supabase-repository.ts`
- `src/data/supabase/outfits.ts`
- `src/data/supabase/replacement-lines.ts`
- `src/context/DataContext.tsx`
- `src/pages/OutfitCreatorPage.tsx`
- `src/pages/LookbookPage.tsx`
- `src/pages/ReplacementLinesPage.tsx`
- `src/App.tsx`
- `src/lib/types.ts`
- 관련 tests, scripts, CSS, pgTAP contract tests

정확한 cleanup 파일 목록은 각 wave 시작 직전 `rg`와 production catalog를 다시 읽고 확정한다.
