# Closet Index Database Cleanup Plan

- 작성일: 2026-08-05
- 근거 문서: [`database-map.md`](./database-map.md)
- 현재 단계: Outfit Preview DB subsystem production cleanup 완료. Storage object 2개와 구 Function 제거만 Dashboard 로그인 대기.

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
| 즉시 안전하게 제거 가능한 DB object | Preview table·RPC·trigger는 제거 완료. orphan Storage object 2개와 구 Function은 로그인 뒤 제거 가능 |
| 가장 독립적인 후보 | `closet_import_runs` 2행 |
| 현재 dependency 때문에 제거할 수 없는 후보 | Legacy Link subsystem. Preview DB dependency는 제거 완료 |
| Outfit Preview 결정 | J가 영구 제거를 확정. frontend·Function 전환과 DB cleanup 완료 |
| Line 색상 자동 분류 | 일회성 초기 제안으로만 사용하고 직접 지정 완료 후 제거 권장 |

`closet_import_runs`는 DB FK·trigger·RPC dependency가 없지만, 아직 export하지 않았고 `scripts/import-supabase.mjs`가 쓰므로 “즉시 DROP”으로 분류하지 않는다.

## 3. Cleanup Wave 1 — Import Runs

### 대상

- `public.closet_import_runs` 2행
- `scripts/import-supabase.mjs`의 import run upsert
- 관련 schema test와 문서

### 선행 작업

1. 두 row를 JSON 또는 CSV로 local-only export한다.
2. export 파일에 row count 2, 정렬 기준, 생성 시각, SHA-256을 함께 기록한다.
3. 현재 migration/import를 다시 실행할 일이 있는지 결정한다.
4. `scripts/import-supabase.mjs`가 table을 쓰지 않도록 제거하거나, historical import 도구 전체를 archive한다.
5. `rg`와 production catalog로 frontend, RPC, trigger, FK dependency가 0인지 재확인한다.

### cleanup migration 초안 범위

- RLS policy와 grant 제거
- `DROP TABLE public.closet_import_runs`
- 관련 contract test 수정

### 완료 검증

- 핵심 table row count와 checksum 불변
- 앱 전체 test/build 통과
- import script가 존재하지 않는 table을 호출하지 않음
- Security/Performance Advisor에 새 오류 없음

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
3. 기존 Preview Storage object 2개는 보존할 필요가 없으며 production cleanup 때 삭제한다.
4. Outfit의 Wear Log 삭제 차단과 workspace 권한 검사는 계속 유지한다.

### 제거 순서

1. [x] UI를 dynamic composition 단일 경로로 바꾸고 preview 상태 필터를 제거한다.
2. [x] `OutfitCreatorPage`, DataContext, repository, types에서 `replaceOutfitPreview` 계약을 제거한다.
3. [x] Outfit 삭제를 `closet-outfit-delete` Edge Function으로 분리하고 Wear Log 보호 RPC를 유지한다.
4. [x] local `closet-outfit-preview` Edge Function과 preview script를 제거한다.
5. [x] stale trigger·private helper·preview RPC·table·Storage policy dependency 제거 migration을 작성한다.
6. [x] 관련 frontend tests, pgTAP 계약, CI 목록을 갱신한다.
7. [x] `closet-outfit-delete` Function과 새 frontend를 production에 배포하고 실제 삭제 차단·성공을 검증한다.
8. [ ] 기존 Preview Storage object 2개를 service-role 경계에서 삭제하고 object count 0을 확인한다.
9. [x] Preview cleanup·Line color·COMMENT migration을 적용하고 table·RPC·trigger·policy dependency가 0인지 확인한다.
10. [ ] 기존 production `closet-outfit-preview` Function을 제거한다.

### production 적용 중단 조건

- 새 공개 앱이 `closet_outfit_previews` 또는 old Function을 계속 호출함
- `closet-outfit-delete`의 인증·Wear Log 차단 검증이 실패함
- Storage object 2개를 정확히 식별하지 못함

이 경우 production table과 old Function은 유지하고 원인을 고친 뒤 다시 진행한다.

## 5. Cleanup Wave 3 — Legacy Link subsystem

### 현재 사실

- Legacy Link 49개는 모두 reviewed.
- revision 51개가 있다.
- 현재 edge 87개 중 manual 62개, `source_kind = legacy_link` 25개다.
- 25개 edge가 `source_legacy_link_id` FK로 Legacy Link를 `ON DELETE RESTRICT` 참조한다.
- reverse RPC는 Legacy 출처 edge의 방향을 바꿀 때 Legacy 판단과 revision도 함께 변경한다.
- Legacy review/edge preview UI, trigger, 여러 RPC가 여전히 접근 가능하다.

### 선행 export

다음 세 자료를 같은 snapshot 시각으로 local-only export한다.

1. Legacy Link 49개 전체
2. revision 51개 전체
3. Legacy 출처 edge 25개와 연결된 Line·Item 이름 lookup

각 export에는 row count, 정렬 기준, timestamp, SHA-256을 기록한다. 사람 읽기용 CSV와 관계 보존용 JSON을 함께 두는 편이 안전하다.

### Legacy edge 전환

1. 25개 edge마다 predecessor, successor, Line, branch, decision reason이 현재 UI와 일치하는지 확인한다.
2. 별도 migration에서 `source_kind = 'manual'`, `source_legacy_link_id = null`로 전환한다.
3. 전환 전후 25개 edge의 ID·방향·설명·Line checksum이 동일한지 검증한다.
4. 모든 edge가 Legacy table 없이 reverse/edit/disconnect 가능한지 인증 fixture로 확인한다.
5. reverse RPC에서 Legacy decision/revision 갱신 분기를 제거하고 edge 자체만 안전하게 반전하도록 단순화한다.

이 단계는 `UPDATE` backfill이므로 현재 문서화 작업에서는 수행하지 않는다.

### UI와 code 제거

- `/replacement-lines/review`
- `/replacement-lines/edges/preview`
- `ReplacementLegacyLinkReviewPage`
- `ReplacementLineageEdgePreviewPage`
- Legacy status/progress UI와 관련 CSS
- repository의 `loadReplacementLegacyLinks`, `reviewReplacementLegacyLink`, `confirmReplacementLineEdges`
- Legacy 전용 types, feature helpers, tests, importer script

Lineage의 manual edge 편집, 시작점, 이동, 병합, 보관 기능은 유지한다.

### DB 제거 순서

1. `mark_legacy_link_edge_needs_review` trigger와 private helper 제거
2. confirm/review/revise Legacy RPC 제거
3. `reverse_closet_replacement_line_edge`의 Legacy dependency가 없는 새 버전 적용
4. edge의 Legacy source FK와 불필요한 source column/index 정리
5. revision table 제거
6. Legacy Link table 제거
7. policies, grants, contract tests 정리

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

## 7. 예상 변경 파일

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
- `src/pages/ReplacementLegacyLinkReviewPage.tsx`
- `src/pages/ReplacementLineageEdgePreviewPage.tsx`
- `src/App.tsx`
- `src/lib/types.ts`
- 관련 tests, scripts, CSS, pgTAP contract tests

정확한 cleanup 파일 목록은 각 wave 시작 직전 `rg`와 production catalog를 다시 읽고 확정한다.
