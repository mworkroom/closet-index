# Closet Index Database Map

- 감사 기준 시각: 2026-08-05 05:22 KST
- production project ref: `ddlwainwollvpaeccpty`
- 범위: `public.closet_*` table, Closet 관련 public RPC, 직접 dependency, 현재 repository/UI 호출 경로
- 안전 경계: 최초 감사는 `SELECT`와 catalog 조회만 수행했다. 이후 J의 제거 결정과 production 전환 승인에 따라 Preview cleanup·Line color·COMMENT migration을 적용했다.

> 2026-08-05 후속 적용: Preview-free frontend와 `closet-outfit-delete` Function을 먼저 배포한 뒤 `closet_outfit_previews`, Preview RPC 세 개와 stale trigger 두 개를 production에서 제거했다. 기존 Preview Storage file 2개와 Dashboard가 만든 빈 폴더 placeholder까지 삭제해 `/outfits/` object count 0을 확인했고, 구 `closet-outfit-preview` Function도 제거했다. 현재 Closet table은 16개, active Edge Function은 3개다.

## 1. 한눈에 보기

| 분류 | 수 | 의미 |
|---|---:|---|
| `LIVE_CORE` | 5 | 사용자가 직접 관리하는 핵심 기록 |
| `LIVE_SUPPORT` | 8 | 핵심 기록을 구성·표시·보호하는 현재 사용 중인 구조 |
| `DORMANT` | 0 | 현재 호출 경로가 없는 구조 |
| `LEGACY_DROP_CANDIDATE` | 3 | 일회성 이전·검토를 위해 만들었고 선행 작업 뒤 제거를 검토할 구조 |
| `UNKNOWN` | 0 | 용도나 호출 경로를 확인하지 못한 구조 |
| **합계** | **16** | 모든 `public.closet_*` table |

초기 감사 당시 `closet_outfit_previews`는 실제 호출 경로가 있어 `LIVE_SUPPORT`였다. 이후 J가 저장 Preview 기능을 사용하지 않기로 결정했고 frontend 선배포와 production cleanup을 거쳐 현재 table inventory에서 제거됐다.

`source of truth`는 “이 값을 다시 만들어 내기 위해 우선 읽어야 하는 원본”을 뜻한다. 캐시·실행 로그·감사 이력은 데이터가 중요해도 현재 화면의 원본으로 분류하지 않는다.

## 2. Production migration history와 Git 비교

- production migration history: 51개
- 그중 Closet Index 관련 migration: 31개
- 현재 working tree와 Git의 Closet migration 파일: 31개
- production에 있으나 Git에 없는 Closet migration: 0개
- 이름 기준으로 production에만 있고 local에 없는 Closet migration은 없다.
- production project에는 Inventory Tracker 계열 migration 20개도 함께 있다. 따라서 이 Supabase project의 전체 migration history는 Closet Index 저장소 하나만으로 재구성할 수 없다.

같은 논리 이름이지만 timestamp가 다른 history가 4쌍 있다.

| 논리 migration | local/Git version | production version |
|---|---|---|
| `phase3_item_outfit_write_contract` | `20260729000405` | `20260729013427` |
| `phase3_item_image_upload_contract` | `20260729003410` | `20260729013547` |
| `phase3_outfit_preview_cache` | `20260731200415` | `20260731220215` |
| `add_safe_item_outfit_deletion` | `20260802013109` | `20260802015500` |

현재 production catalog의 16개 table, 주요 column, foreign key, 5개 trigger, 2개 통계 view, 28개 public Closet RPC는 적용 완료된 local migration의 최종 상태와 구조적으로 맞는다. 남은 history 차이는 위의 기존 timestamp 불일치 4쌍뿐이다. Supabase migration history 목록은 SQL checksum을 제공하지 않으므로, 이름이 같은 migration 본문의 byte 단위 동일성까지 확인한 결과로 해석하면 안 된다.

## 3. 공통 규칙

- 16개 table 모두 RLS가 켜져 있다.
- 모든 table의 `workspace_id`는 `public.workspaces(id)`를 참조한다.
- 업무 데이터의 일반적인 source of truth는 table이다. Storage의 실제 이미지 binary는 `closet-images` bucket이 원본이고, 이미지 table은 소유권·상태·경로의 source of truth다.
- `closet_item_stats`, `closet_outfit_stats`는 table이 아니라 계산 view다.

## 4. Table inventory

| Table | 한국어 이름 | 상태 | Source of truth | Rows | Total size |
|---|---|---|---|---:|---:|
| `closet_color_palette` | 색상 팔레트 | `LIVE_SUPPORT` | 예: 명명된 색상과 HEX | 22 | 80 kB |
| `closet_import_runs` | 초기 가져오기 실행 기록 | `LEGACY_DROP_CANDIDATE` | 아니오: 일회성 실행 로그 | 2 | 48 kB |
| `closet_item_images` | Item 이미지 메타데이터 | `LIVE_SUPPORT` | 예: 이미지 경로·상태 | 511 | 536 kB |
| `closet_items` | 옷장 Item | `LIVE_CORE` | 예 | 448 | 616 kB |
| `closet_outfit_items` | Outfit 구성 Item | `LIVE_SUPPORT` | 예: Outfit 구성과 배치 | 2,406 | 1,072 kB |
| `closet_outfits` | Outfit | `LIVE_CORE` | 예 | 507 | 432 kB |
| `closet_places` | 장소 선택지 | `LIVE_SUPPORT` | 예 | 25 | 80 kB |
| `closet_replacement_legacy_link_revisions` | Legacy 판단 변경 이력 | `LEGACY_DROP_CANDIDATE` | 아니오: 감사 이력 | 51 | 96 kB |
| `closet_replacement_legacy_links` | Notion Legacy 관계 검토본 | `LEGACY_DROP_CANDIDATE` | 과도기: 초기 판단 원본 | 49 | 192 kB |
| `closet_replacement_line_edges` | 계보 방향 연결 | `LIVE_CORE` | 예: 현재 계보 연결 | 87 | 232 kB |
| `closet_replacement_line_items` | Line membership | `LIVE_SUPPORT` | 예 | 165 | 200 kB |
| `closet_replacement_line_starts` | 명시적 계보 시작점 | `LIVE_SUPPORT` | 예 | 25 | 40 kB |
| `closet_replacement_lines` | Replacement Line | `LIVE_CORE` | 예 | 53 | 160 kB |
| `closet_transport_modes` | 교통수단 선택지 | `LIVE_SUPPORT` | 예 | 4 | 80 kB |
| `closet_wear_logs` | 착용 기록 | `LIVE_CORE` | 예 | 783 | 1,048 kB |
| `closet_weather_locations` | 날씨 위치 | `LIVE_SUPPORT` | 예 | 1 | 96 kB |

### 4.1 `closet_color_palette`

- 주요 columns: `id`, `display_name`, `display_hex`, `semantic_color`, timestamps.
- foreign keys: 공통 `workspace_id` FK 외 업무 FK 없음. `closet_items.palette_id`가 이 table을 참조한다.
- 읽기: `src/data/supabase/items.ts`, `src/data/supabase/snapshot.ts`의 Item join.
- 쓰기: 현재 앱 repository에는 팔레트 자체 편집이 없고 `scripts/import-supabase.mjs`가 초기 값을 기록한다. Item 편집은 `palette_id`를 선택한다.
- trigger/dependency: Item FK가 삭제를 막는다.
- 유지 이유와 cleanup: 현재 Item 색상 이름과 HEX의 공통 사전이므로 유지한다. 다만 22개 팔레트 row는 현재 12개 Line category와 1:1로 같지 않으므로 Line category FK로 억지로 재사용하지 않는다. 기존 HEX는 직접 지정 UI의 제안·표시 자료로 활용할 수 있다.

### 4.2 `closet_import_runs`

- 주요 columns: `source`, `status`, `source_snapshot_at`, `counts`, `report`, `started_at`, `completed_at`.
- foreign keys: 공통 `workspace_id` FK만 있다.
- 읽기: 현재 frontend/repository에서 읽지 않는다.
- 쓰기: `scripts/import-supabase.mjs`의 초기 migration 기록 단계만 쓴다.
- trigger/dependency: FK, trigger, public Closet RPC dependency가 없다.
- 유지 이유와 cleanup: 두 건 모두 `passed`인 초기 이력이다. DB 구조상 가장 독립적이지만, export와 import script 수정 전에는 제거하지 않는다. Wave 1 후보.

### 4.3 `closet_item_images`

- 주요 columns: `id`, `item_id`, `storage_path`, `variant`, `status`, `width_px`, `height_px`, timestamps.
- foreign keys: `item_id -> closet_items(id)` `ON DELETE CASCADE`.
- 읽기: `src/data/image-assets.ts`; 보조 도구 `scripts/image-bulk-tool.mjs`, `scripts/prepare-image-upload.mjs`.
- 쓰기: `closet-item-image` Edge Function을 거쳐 begin/finalize/cancel RPC가 쓰며 Item 삭제 RPC도 함께 정리한다.
- trigger/dependency: Storage object와 4개 이미지 RPC가 연결된다.
- 유지 이유와 cleanup: 현재 Item 이미지 표시의 필수 메타데이터다. cleanup 후보가 아니다.

### 4.4 `closet_items`

- 주요 columns: `id`, `name`, `category`, `semantic_color`, `palette_id`, `display_hex`, `seasons`, `retired`, `rain_ok`, `long_walk_ok`, `memo`, `acquired_on`.
- foreign keys: `palette_id -> closet_color_palette(id)`; 공통 workspace FK.
- 읽기: `src/data/supabase/items.ts`, `src/data/supabase/snapshot.ts`, Statistics·Closet·Lineage 화면과 여러 audit/upload script.
- 쓰기: `SupabaseItemRepository`의 create/update/retired/suitability; 삭제는 `closet-item-image` Edge Function과 `delete_closet_item_if_unreferenced` RPC.
- trigger/dependency: `closet_item_images`, `closet_outfit_items`, `closet_replacement_line_items`, Legacy Link 양쪽 FK와 `closet_item_stats` view가 삭제를 막거나 참조한다.
- 유지 이유와 cleanup: 옷장의 핵심 원본이다. cleanup 후보가 아니다.

### 4.5 `closet_outfit_items`

- 주요 columns: `outfit_id`, `item_id`, `slot`, `sort_order`, `position_x`, `position_y`, `scale`, `z_index`.
- foreign keys: `outfit_id -> closet_outfits(id)` `ON DELETE CASCADE`; `item_id -> closet_items(id)` `ON DELETE RESTRICT`.
- 읽기: `src/data/supabase/snapshot.ts`, `src/data/supabase/outfits.ts`.
- 쓰기: create/update/clone Outfit RPC와 `updateItemPlacement` direct update.
- trigger/dependency: `closet_item_stats` view와 Outfit RPC가 참조한다.
- 유지 이유와 cleanup: Outfit의 구성·위치 source of truth다. cleanup 후보가 아니다.

### 4.6 제거 기록 — `closet_outfit_previews`

- 초기 감사 당시 2개 ready row가 있던 파생 이미지 cache였다.
- migration `20260804213423_remove_outfit_preview_subsystem`에서 table, upload RPC 세 개와 stale trigger 두 개를 제거했다.
- 현재 Outfit 화면은 `closet_outfit_items + closet_item_images`를 즉시 합성하고 cutout이 없을 때 색상 swatch를 사용한다.
- 기존 Storage file 2개와 구 Edge Function까지 제거해 Preview 운영 잔여물이 없다. active Edge Function은 `closet-item-image`, `closet-outfit-delete`, `closet-weather-forecast` 세 개다.

### 4.7 `closet_outfits`

- 주요 columns: `id`, `display_name`, `rating`, `archived_at`, timestamps, Notion provenance.
- foreign keys: 공통 workspace FK. `closet_outfit_items`, `closet_wear_logs`가 참조한다.
- 읽기: `src/data/supabase/snapshot.ts`, `src/data/supabase/outfits.ts`.
- 쓰기: create/update/clone RPC, repository의 archive update, Edge Function을 거친 안전 삭제 RPC.
- trigger/dependency: `closet_outfit_stats` view, wear log FK와 Outfit 관련 RPC가 연결된다.
- 유지 이유와 cleanup: Outfit 핵심 원본이다. cleanup 후보가 아니다.

### 4.8 `closet_places`

- 주요 columns: `id`, `notion_option_id`, `name`, `active`, `created_at`.
- foreign keys: `closet_wear_logs.place_id`가 참조한다.
- 읽기: `src/data/supabase/snapshot.ts`에서 active 선택지를 읽는다.
- 쓰기: 현재 앱에는 선택지 관리 UI가 없고 초기 import script가 기록한다.
- trigger/dependency: Wear Log FK가 삭제를 제한한다.
- 유지 이유와 cleanup: Wear Log 입력·표시의 공통 사전이다. 관리 UI가 없다는 이유로 legacy는 아니다.

### 4.9 `closet_transport_modes`

- 주요 columns: `id`, `notion_option_id`, `name`, `active`, `created_at`.
- foreign keys: `closet_wear_logs.transport_mode_id`가 참조한다.
- 읽기: `src/data/supabase/snapshot.ts`.
- 쓰기: 현재 앱 관리 UI는 없고 초기 import script가 기록한다.
- trigger/dependency: Wear Log FK가 삭제를 제한한다.
- 유지 이유와 cleanup: Wear Log의 현재 선택지 원본이다. cleanup 후보가 아니다.

### 4.10 `closet_weather_locations`

- 주요 columns: `id`, `label`, `official_name`, `admin_code`, `nx`, `ny`, `is_default`, timestamps.
- foreign keys: `closet_wear_logs.weather_location_id`가 참조한다.
- 읽기: `src/data/supabase/snapshot.ts`, `src/data/supabase/weather.ts`, `closet-weather-forecast` Edge Function.
- 쓰기: `SupabaseWeatherRepository.saveDefaultLocation`.
- trigger/dependency: Wear Log FK와 날씨 Edge Function이 연결된다.
- 유지 이유와 cleanup: 현재 날씨 provenance와 기본 위치의 source of truth다.

### 4.11 `closet_wear_logs`

- 주요 columns: `outfit_id`, `worn_on`, 출발·귀가 온도와 체감, 비·도보 조건, 장소·교통·날씨 provenance, `submission_token`, memo.
- foreign keys: `outfit_id`, `place_id`, `transport_mode_id`, `weather_location_id`가 각 업무 table을 `ON DELETE RESTRICT`로 참조한다.
- 읽기: `src/data/supabase/snapshot.ts`, `src/data/supabase/wear-logs.ts`, Statistics·Calendar·Outfit 상세.
- 쓰기: `SupabaseWearLogRepository` direct create/update/delete.
- trigger/dependency: `closet_item_stats`, `closet_outfit_stats` view와 안전 Outfit 삭제 RPC가 참조한다.
- 유지 이유와 cleanup: 실제 착용 기록과 통계의 핵심 원본이다.

### 4.12 `closet_replacement_lines`

- 주요 columns: `id`, `name`, `style_identity`, `review_status`, `lifecycle_status`, `representative_line_id`, `archived_at`, `updated_at`.
- foreign keys: `(workspace_id, representative_line_id)` self FK `ON DELETE RESTRICT`.
- 읽기: `src/data/supabase/replacement-lines.ts`, Replacement Line 목록·Lineage 화면, Phase 4 audit script.
- 쓰기: Item 이동, Line 병합, 보관·복원, 재검토 완료, 이름·Style Identity·색상 수정과 빈 Line 삭제 RPC. 초기 import도 생성한다.
- trigger/dependency: membership·edge·start FK와 lifecycle RPC가 연결된다.
- 유지 이유와 cleanup: Line의 핵심 원본이다. production migration `20260804213528_add_replacement_line_color_category`은 이 table에 사람이 읽을 수 있는 nullable `color_category` 하나만 추가했으며 별도 색상 table은 만들지 않았다. 기존 팔레트 HEX는 입력 제안·tile 표시에만 활용하고 모든 active Line의 직접 값이 채워진 뒤 자동 fallback 제거를 검토한다.

### 4.13 `closet_replacement_line_items`

- 주요 columns: `replacement_line_id`, `item_id`, `created_at`.
- foreign keys: Line `ON DELETE CASCADE`, Item `ON DELETE RESTRICT`.
- 읽기: `src/data/supabase/replacement-lines.ts`, Phase 4 audit script.
- 쓰기: Item 이동·Line 병합, Line 미소속 Item 추가·현재 Line 제외 RPC와 초기 import.
- trigger/dependency: `require_active_closet_replacement_line_membership`; edge와 start의 composite FK가 이 membership을 참조한다.
- 유지 이유와 cleanup: “어떤 Item이 어떤 Line인가”의 source of truth다.

### 4.14 `closet_replacement_line_edges`

- 주요 columns: predecessor/successor Item, `source_kind`, `source_legacy_link_id`, `branch_name`, `decision_reason`, `status`, confirmation metadata.
- foreign keys: predecessor·successor는 같은 Line membership을 참조한다. `source_legacy_link_id`는 Legacy Link를 `ON DELETE RESTRICT`로 참조한다.
- 읽기: `src/data/supabase/replacement-lines.ts`, Lineage·edge preview 화면.
- 쓰기: confirm, manual create, detail/connection edit, disconnect, reverse, move/merge RPC.
- trigger/dependency: `require_active_closet_replacement_line_edge`, `validate_closet_replacement_line_edge`. 현재 87개 중 62개는 manual, 25개는 Legacy Link FK를 유지한다.
- 유지 이유와 cleanup: 현재 계보의 source of truth다. table 자체는 유지하며 Wave 3에서 25개 Legacy 출처 edge만 독립 manual edge로 전환한다.

### 4.15 `closet_replacement_line_starts`

- 주요 columns: `replacement_line_id`, `item_id`, `designated_at`, `designated_by`.
- foreign keys: `(workspace_id, replacement_line_id, item_id)`가 Line membership을 참조하고 지정자는 `auth.users`를 참조한다.
- 읽기: `src/data/supabase/replacement-lines.ts`, Lineage 화면.
- 쓰기: start 지정, edge disconnect, Item 이동·Line 병합 RPC.
- trigger/dependency: `require_active_closet_replacement_line_start`; edge와 동시에 시작점이 되지 않도록 RPC가 검증한다.
- 유지 이유와 cleanup: graph만으로 추정할 수 없는 명시적 G0의 source of truth다.

### 4.16 `closet_replacement_legacy_links`

- 주요 columns: Item A/B, source Notion IDs, review status/decision/reason, reviewer와 timestamps.
- foreign keys: Item A/B `ON DELETE RESTRICT`, reviewer `auth.users`; revisions와 25개 edge가 이 table을 참조한다.
- 읽기: `src/data/supabase/replacement-lines.ts`, Replacement Line 목록, Legacy review·edge preview 화면.
- 쓰기: revise/review RPC, edge 확인·방향 전환 RPC. `mark_legacy_link_edge_needs_review` trigger가 연결된 edge를 갱신한다.
- 현재 상태: 49개 모두 `reviewed`다.
- 유지 이유와 cleanup: 현재 UI와 25개 edge가 아직 의존한다. export, edge 전환, reverse RPC 단순화, review UI 제거 뒤 Wave 3에서 제거한다.

### 4.17 `closet_replacement_legacy_link_revisions`

- 주요 columns: `legacy_link_id`, `revision_number`, `decision`, `reason`, reviewer, timestamps.
- foreign keys: Legacy Link `ON DELETE RESTRICT`, reviewer `auth.users`.
- 읽기: 현재 frontend repository는 revision table을 직접 읽지 않는다.
- 쓰기: `revise_closet_replacement_legacy_link`; Legacy 기반 edge 방향 전환도 이 RPC를 통해 revision을 추가한다.
- trigger/dependency: revise/reverse RPC가 의존한다.
- 유지 이유와 cleanup: 51개 판단 이력의 export가 필요하다. Legacy subsystem과 함께 Wave 3에서 제거한다.

## 5. Public Closet RPC inventory

모든 함수는 production `public` schema의 현재 signature를 기준으로 기록했다. `UI`의 “간접”은 frontend가 Edge Function이나 상위 RPC를 호출하고 해당 함수가 내부에서 실행된다는 뜻이다.

`clone_closet_outfit(uuid, uuid, uuid, text)`은 2026-08-25 remote migration `20260824180057_remove_outfit_clone_rpc`로 제거되어 현재 inventory에서 제외했다. 감사 기준선과 복구 SQL은 [`database-cleanup-plan.md`](./database-cleanup-plan.md)와 `supabase/rollback/remove_outfit_clone_rpc_rollback.sql`에 보존한다.

| Function과 arguments | 호출 경로 / UI | 참조 table | Transaction으로 묶는 이유 | 현재 판정 |
|---|---|---|---|---|
| `begin_closet_item_image_upload(workspace, item, image, width, height, bytes)` | `closet-item-image` Edge Function; Item 편집에서 간접 접근 | items, item_images | pending row·경로·기존 upload 정리의 일관성 | 필요 |
| `finalize_closet_item_image_upload(workspace, item, image)` | 같은 Edge Function; 간접 | item_images | ready 전환과 교체 경로 반환 | 필요 |
| `cancel_closet_item_image_upload(workspace, item, image)` | 같은 Edge Function; 실패 복구에서 간접 | item_images | pending 취소와 storage 정리 대상 확정 | 필요 |
| `create_closet_outfit(workspace, outfit, name, items, allow_duplicate)` | `SupabaseOutfitRepository.create`; Outfit 생성 UI | outfits, 내부 helper를 통한 outfit_items/items | header·구성·중복 검사를 한 번에 저장 | 필요 |
| `update_closet_outfit(workspace, outfit, name, items, allow_duplicate)` | `SupabaseOutfitRepository.update`; Outfit 편집 UI | items, outfits, outfit_items | 기존 구성 교체와 중복 검사를 원자 처리 | 필요 |
| `find_matching_closet_outfits(workspace, item_ids[])` | `SupabaseOutfitRepository.findMatching`; 생성 중 중복 확인 | outfits, outfit_items | 읽기 함수이며 동일 item set 계산을 서버에서 고정 | 필요 |
| `delete_closet_item_if_unreferenced(user, workspace, item)` | `closet-item-image` Edge Function; Item 삭제 UI | items, images, outfit_items, line_items | 참조 재확인·row 삭제·storage 경로 반환 | 필요 |
| `delete_closet_outfit_if_unworn(user, workspace, outfit)` | `closet-outfit-delete` Edge Function; Outfit 삭제 UI | outfits, wear_logs | Wear Log 차단과 삭제를 한 transaction에서 처리 | 필요 |
| `review_closet_replacement_legacy_link(workspace, link, decision, reason)` | 현재 repository가 직접 호출하지 않음; revise RPC의 최초 검토 wrapper | legacy_links | pending 상태 확인 뒤 revision 저장 RPC 호출 | Wave 3 후보, 현재 legacy workflow 보조 |
| `revise_closet_replacement_legacy_link(workspace, link, expected_updated_at, decision, reason)` | `reviewLegacyLink`; Legacy review UI와 reverse RPC | legacy_links, revisions | optimistic lock·현재 판단·append-only revision 동시 저장 | Wave 3 후보, 현재 필요 |
| `confirm_closet_replacement_line_edge(workspace, line, legacy_link, expected_updated_at, branch, reason)` | bulk confirm RPC 내부; UI 직접 호출 없음 | legacy_links, edges | 검토 결과 재검증과 단일 edge 확정 | Wave 3 후보, 현재 bulk helper |
| `confirm_closet_replacement_line_edges(workspace, candidates jsonb)` | `confirmEdges`; edge preview UI | edges, singular confirm을 통한 legacy_links | 후보 하나가 실패하면 batch 전체 rollback | Wave 3 후보, 현재 review 완료 흐름에 남음 |
| `create_closet_replacement_manual_edge(workspace, line, predecessor, successor, branch, reason)` | `createManualEdge`; Lineage UI | edges | membership·start·cycle 검증과 edge 생성 | 필요 |
| `create_closet_replacement_line(workspace, name, style_identity, color_category)` | `create`; Replacement Lines 상단 신규 Line UI | lines | 인증된 workspace에 사람이 지정한 metadata로 active·빈 Line 생성 | 필요 |
| `revise_closet_replacement_line_edge_details(workspace, edge, expected_updated_at, branch, reason)` | 현재 frontend public port·adapter·production UI caller 없음; DB RPC와 migration만 보존 | edges | optimistic lock과 설명 변경 | frontend-unused; DB 계약 보존 |
| `update_closet_replacement_line_edge_connection(workspace, edge, expected_updated_at, predecessor, branch, reason)` | `updateEdgeConnection`; Lineage UI | edges, line_items | predecessor 변경·cycle·membership 검증 | 필요 |
| `disconnect_closet_replacement_line_edge(workspace, edge, expected_updated_at)` | `disconnectEdge`; Lineage UI | edges, starts | edge 해제와 successor의 start 전환 | 필요 |
| `reverse_closet_replacement_line_edge(workspace, edge, expected_updated_at)` | `reverseEdge`; Lineage UI | edges, legacy_links, revisions 경유 | 방향·legacy 판단·revision을 함께 rollback 가능하게 변경 | 필요; Wave 3에서 legacy 없는 구현으로 교체 |
| `set_closet_replacement_line_start(workspace, line, item, is_start)` | `setStart`; Lineage UI | line_items, edges, starts | incoming edge와 start 배타성 검증 | 필요 |
| `move_closet_replacement_line_item(workspace, source, item, target, new_name, new_style, expected_source, expected_target)` | `moveItem`; Lineage UI | lines, line_items, edges, starts | membership 이동·새 Line·start·review 상태를 원자 처리 | 필요 |
| `merge_closet_replacement_lines(workspace, source, target, expected_source, expected_target)` | `mergeLines`; Line 관리 UI | lines, line_items, edges, starts | membership·edge·start 병합과 source 보관, cycle/충돌 검사 | 필요 |
| `set_closet_replacement_line_archived(workspace, line, archived, expected_updated_at)` | `setArchived`; Line 관리 UI | lines | lifecycle·대표 관계·동시성 규칙 적용 | 필요 |
| `set_closet_replacement_line_color_category(workspace, line, expected_updated_at, color_category)` | `setColorCategory`; Line 관리 UI | lines | 사람의 대표 색상 지정과 optimistic concurrency | 필요 |
| `acknowledge_closet_replacement_line_review(workspace, line, expected_updated_at)` | `acknowledgeReview`; Lineage 재검토 완료 UI | lines, edges | pending edge 재확인과 Line review 상태 변경 | 필요 |
| `update_closet_replacement_line_details(workspace, line, expected_updated_at, name, style_identity)` | `updateDetails`; Line 관리 UI | lines | 이름·Style Identity 검증과 optimistic concurrency | 필요 |
| `delete_empty_closet_replacement_line(workspace, line, expected_updated_at)` | `deleteEmpty`; 빈 Line 삭제 UI | lines, line_items, edges, starts | 모든 dependency 재확인 뒤 빈 Line만 삭제 | 필요 |
| `add_closet_replacement_line_item(workspace, line, item, expected_updated_at)` | `addItem`; Line 관리의 Item 추가 UI | items, lines, line_items, starts | Line 미소속 재확인·membership·start·review 상태를 원자 처리 | 필요 |
| `remove_closet_replacement_line_item(workspace, source, item, expected_source_updated_at)` | `removeItem`; 계보 Item의 Line에서 빼기 UI | items, lines, line_items, edges, starts | source Line edge만 차단·source membership/start만 제거·source Line review 전환; 다른 Line 소속과 계보 보존 | 필요 |

## 6. Trigger와 view dependency

### Triggers

| Trigger | Table | Function | 의미 |
|---|---|---|---|
| `mark_legacy_link_edge_needs_review` | legacy_links | `private.mark_legacy_link_edge_needs_review` | legacy 판단 변경 시 출처 edge 재검토 |
| `require_active_closet_replacement_line_membership` | line_items | `private.require_active_closet_replacement_line` | archived Line 직접 변경 차단 |
| `require_active_closet_replacement_line_edge` | line_edges | `private.require_active_closet_replacement_line` | archived Line 직접 변경 차단 |
| `validate_closet_replacement_line_edge` | line_edges | `private.validate_closet_replacement_line_edge` | membership·self-edge·cycle 검증 |
| `require_active_closet_replacement_line_start` | line_starts | `private.require_active_closet_replacement_line` | archived Line 직접 변경 차단 |

### Views

- `closet_item_stats`: `closet_items`, `closet_outfit_items`, `closet_wear_logs`에 의존한다.
- `closet_outfit_stats`: `closet_outfits`, `closet_wear_logs`에 의존한다.

## 7. 자동 분류에 대한 결론

현재 Line 색상 자동 분류는 production table이나 RPC가 아니라 `src/features/replacement-lines/replacement-line-overview.ts`에서 Line 이름과 Item 팔레트를 조합해 만든 파생값이다. 따라서 migration을 위해 필요했던 초기 제안 로직으로 취급할 수 있고, 영구 DB subsystem으로 보존할 이유가 없다.

local 차기 버전에 구현한 단순한 목표 구조는 다음과 같다.

1. `closet_replacement_lines`에 사람이 읽을 수 있는 nullable `color_category` 직접 지정 값을 둔다.
2. 직접 지정 값이 있으면 그것만 source of truth로 사용한다.
3. 기존 53개 Line을 채우는 동안에만 현재 자동 분류와 기존 Item 팔레트 HEX를 초기 제안/fallback으로 사용한다.
4. 모든 active Line의 값이 채워지고 export·검증이 끝나면 자동 분류 코드와 “이름에 색상 필수” 규칙을 제거한다.

production migration과 Line 관리 UI는 새 색상 분류 table이나 자동화 이력 table을 추가하지 않고, J가 SQL에서 `replacement_lines.color_category` 하나를 바로 읽고 앱에서 계속 수정·초기화할 수 있게 한다. 공개 앱에서 `Blue` 저장과 자동 제안 초기화를 검증했고 현재 53개 Line의 직접 값은 모두 null이다. category 이름 자체를 나중에 대규모로 통합·번역해야 할 요구가 생길 때만 별도 category table을 재검토한다.
