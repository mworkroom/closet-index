# Closet Index Database Map

- 최초 전수 감사 기준 시각: 2026-08-05 05:22 KST
- 최신 Replacement Line·Legacy Link production cleanup 검증: 2026-08-27
- production project ref: `ddlwainwollvpaeccpty`
- 범위: `public.closet_*` table, Closet 관련 public RPC, 직접 dependency, 현재 repository/UI 호출 경로
- 안전 경계: 최초 감사는 `SELECT`와 catalog 조회만 수행했다. 이후 J의 제거 결정과 production 전환 승인에 따라 Preview cleanup·Line color·COMMENT, Outfit clone RPC, Import Runs와 Legacy Link cleanup migration을 적용했다.

> 2026-08-05 후속 적용: Preview-free frontend와 `closet-outfit-delete` Function을 먼저 배포한 뒤 `closet_outfit_previews`, Preview RPC 세 개와 stale trigger 두 개를 production에서 제거했다. 기존 Preview Storage file 2개와 Dashboard가 만든 빈 폴더 placeholder까지 삭제해 `/outfits/` object count 0을 확인했고, 구 `closet-outfit-preview` Function도 제거했다. 당시 Closet table은 16개였다.

> 2026-08-25 후속 감사: 이후 추가된 Purchase·Care·Place HVAC table을 inventory에 보충하고, 일회성 `closet_import_runs`를 remote migration `20260825021515_remove_closet_import_runs`로 제거했다. 당시 `public.closet_*` table은 18개였으며 모두 RLS가 켜져 있었다.

> 2026-08-26 Legacy Link 적용 전 감사: Replacement subsystem은 Line 66개, membership 194개, start 50개, confirmed edge 119개였다. edge는 manual 101개·Legacy 출처 18개이며 Legacy Link 49개와 revision 51개를 보존하고 있었다. 초기 review/preview client workflow와 source field mapping은 제거·선행 배포했고 공개 JavaScript 58개에서 관련 route·table·review/confirm RPC·source column 문자열 0건을 확인했다.

> 같은 날 00:28:47.967307 UTC의 단일 read-only snapshot에서 Legacy Link 49개, revision 51개, Legacy 출처 edge 18개와 Line·Item 이름 lookup을 local-only CSV·JSON으로 export했다. 디스크 checksum, JSON·CSV row count, 관계 정합성, 직후 production 재조회 hash가 모두 일치했으며 production write는 0건이다.

> 2026-08-27 production cleanup: 적용 직전 49·51·18행, integrity 0건과 전체 119개·Legacy 18개 의미 checksum을 다시 확인한 뒤 remote migration `20260827122033_remove_replacement_legacy_link_subsystem`을 적용했다. edge 18개의 source field만 제거하고 12개 의미 field를 보존했으며 Legacy table·RPC·trigger·source column·constraint·index를 제거했다. 적용 후 Line 66개, membership 194개, start 50개, confirmed edge 119개와 전체 edge SHA-256이 그대로고 `public.closet_*` table은 RLS가 켜진 16개다.

## 1. 한눈에 보기

| 분류 | 수 | 의미 |
|---|---:|---|
| `LIVE_CORE` | 8 | 사용자가 직접 관리하는 핵심 기록 |
| `LIVE_SUPPORT` | 8 | 핵심 기록을 구성·표시·보호하는 현재 사용 중인 구조 |
| `DORMANT` | 0 | 현재 호출 경로가 없는 구조 |
| `UNKNOWN` | 0 | 용도나 호출 경로를 확인하지 못한 구조 |
| **합계** | **16** | 모든 `public.closet_*` table |

초기 감사 당시 `closet_outfit_previews`는 실제 호출 경로가 있어 `LIVE_SUPPORT`였다. 이후 J가 저장 Preview 기능을 사용하지 않기로 결정했고 frontend 선배포와 production cleanup을 거쳐 현재 table inventory에서 제거됐다.

`source of truth`는 “이 값을 다시 만들어 내기 위해 우선 읽어야 하는 원본”을 뜻한다. 캐시·실행 로그·감사 이력은 데이터가 중요해도 현재 화면의 원본으로 분류하지 않는다.

## 2. Production migration history와 Git 비교

- production migration history: 69개
- 그중 Closet Index 관련 remote migration: 47개
- 현재 working tree와 Git의 Closet migration 파일: 47개
- 이름과 timestamp가 모두 같은 Closet migration: 47개
- 같은 이름이지만 local·remote timestamp가 다른 Closet migration: 0쌍
- 이름 기준으로 local에만 있고 production history에 없는 Closet migration: 0개
- production project에는 Inventory Tracker·Pay Me Mom 계열 migration 22개도 함께 있다. 따라서 이 Supabase project의 전체 migration history는 Closet Index 저장소 하나만으로 재구성할 수 없다.

2026-08-26 repair 전에는 같은 논리 이름이지만 timestamp가 다른 history가 아래 8쌍 있었다.

| 논리 migration | local/Git version | 종전 production version | 본문 감사와 현재 상태 |
|---|---|---|---|
| `phase3_item_outfit_write_contract` | `20260729000405` | `20260729013427` | 정규화 일치, local version으로 교체 완료 |
| `phase3_item_image_upload_contract` | `20260729003410` | `20260729013547` | 정규화 일치, local version으로 교체 완료 |
| `phase3_outfit_preview_cache` | `20260731200415` | `20260731220215` | 정규화 일치, local version으로 교체 완료 |
| `add_safe_item_outfit_deletion` | `20260802013109` | `20260802015500` | 정규화 일치, local version으로 교체 완료 |
| `p6_2_purchase_events` | `20260805170605` | `20260805202407` | 정규화 일치, local version으로 교체 완료 |
| `p6_4_care_events` | `20260805191039` | `20260805202519` | 정규화 일치, local version으로 교체 완료 |
| `p6_event_foreign_key_indexes` | `20260805202648` | `20260805203021` | 정규화 일치, local version으로 교체 완료 |
| `preserve_quantity_for_general_purchase_events` | `20260805230843` | `20260805232501` | 정규화 일치, local version으로 교체 완료 |

2026-08-26 읽기 전용 후속 감사에서 production `schema_migrations.statements`와 local SQL 파일 본문을 8쌍 모두 직접 대조했다. 감사 시점에는 각 논리 이름이 production에 정확히 1행만 있고 각 행의 `statements` cardinality도 1이며, local version은 부재하고 위 종전 production version만 존재했다. 전체 history 68개 기준선도 유지됐다.

비교 정규화는 UTF-8 BOM 제거, CRLF·CR을 LF로 통일, 파일 경계의 공백 제거로만 제한했다. 대상 local·production 본문에는 BOM이 없었고, 8쌍 모두 이 정규화 뒤 문자 단위와 독립 SHA-256이 각각 일치했다. raw 문자열 차이는 줄바꿈 형식과 파일 끝 newline뿐이므로 SQL 의미나 객체 정의가 다른 drift가 아니다. Git 이력과 당시 개발 로그에도 local 파일 version과 위 별도 production 적용 version이 각각 기록돼 있어, 8쌍은 **본문이 같은 timestamp-only history drift**로 확정한다. 이번 감사에서는 migration SQL이나 history DML을 실행하지 않았다.

후속 승인에 따라 같은 날 history 정렬 repair를 실행했다. `schema_migrations`를 잠근 짧은 transaction에서 전체 68행과 기존 fingerprint, 정확한 8개 source row, local version 충돌 0건을 다시 확인한 뒤 `version`만 local/Git 값으로 한 번에 교체했다. row를 삭제·추가하거나 migration SQL을 재실행하지 않았으므로 기존 `name`, `statements`, `created_by`, `idempotency_key`, `rollback` payload는 그대로 유지됐다.

독립 재조회에서 전체 history 68행, 종전 version 0행, local version 8행, 논리 이름별 1행을 확인했다. target payload와 나머지 60개 history fingerprint가 유지됐고, local 46개는 이름과 timestamp가 모두 production과 일치한다. 18개 Closet 업무 table의 전체 row count·row fingerprint와 column·constraint·index·function·policy·trigger·grant 등 9개 public catalog 범주의 fingerprint도 전후 동일했다.

2026-08-26 감사에서 당시 local-only였던 두 migration의 적용 경로를 원본 실행 기록까지 추적했다. 두 파일 모두 2026-08-10에 파일 본문을 읽어 `execute_sql`의 명시적 transaction으로 production에 적용됐고 `apply_migration`은 사용하지 않았다. 따라서 schema는 적용됐지만 `supabase_migrations.schema_migrations` row가 생기지 않은 원인이 확정됐다.

현재 production은 두 migration의 최종 합성 결과와 일치한다. Wear Log HVAC mode·intensity column과 세 CHECK, Place kind column·CHECK·분류, Place HVAC Profile의 9개 column·9개 constraint·2개 index·RLS·policy 3개·접근 grant·COMMENT가 모두 존재하고, 후속 제거 대상인 `observed_hvac_memo` column·CHECK는 부재한다. Wear Log 808행, Place 25행, Profile 10행의 값 위반·고아 Profile·generic Place Profile은 0건이다. local SQL SHA-256은 P5B `c5d5d427bc662b09a170095ac8f752ccee3636524e83f52b8296c6aa739c7a3a`, memo cleanup `f4288bcf1712c00d3cf6118a81eba1d670e7916ffe331eaa2cd82b30a1628834`다.

Supabase [Database Migrations 가이드](https://supabase.com/docs/guides/deployment/database-migrations)와 [migration repair CLI 문서](https://supabase.com/docs/reference/cli/supabase-migration-repair) 기준상 실제 schema가 이미 적용된 수동 migration은 SQL을 재실행하지 않고 `migration repair --status applied <timestamp>`로 tracking row만 보정할 수 있다. 두 migration은 이 조건을 충족했고, 2026-08-26 후속 작업에서 `20260809200608_p5b_place_profile_hvac`와 `20260809211440_remove_wear_log_hvac_memo` tracking row를 추가했다.

작업 세션에는 Supabase CLI access token이 없어 CLI 2.109.1을 production에 직접 연결하지 않았다. 대신 같은 버전의 공식 구현이 수행하는 `version`, `name`, 분리된 `statements` 기록 방식을 원본 소스로 확인한 뒤, 이미 인증된 Supabase 연결에서 history table을 잠그고 사전 기준선이 동일할 때만 두 row를 한 transaction으로 삽입했다. migration SQL은 재실행하지 않았다. repair 뒤 전체 history는 68개가 됐고 대상 row의 statement 수는 각각 25개와 1개다. 기존 66개 history fingerprint, Wear Log 808행·Place 25행·Profile 10행의 값 fingerprint, 관련 constraint·index·policy catalog fingerprint, Security Advisor 47건과 Performance Advisor 33건은 전후 동일했다.

두 차례 repair로 누락된 적용 사실 2개와 timestamp-only drift 8쌍은 모두 정렬됐다. Legacy Link cleanup 뒤 Closet Index 저장소 기준 local 47개와 production 47개는 이름·timestamp가 정확히 일치하지만, shared project의 다른 앱 remote migration 22개는 이 저장소에 없으므로 전체 project를 단일 저장소의 `db push` 호환 상태로 부르지 않는다. 전체 CLI 동기화가 필요하면 여러 저장소의 migration 소유권과 통합 방식을 별도로 결정한다. Supabase migration history 목록은 SQL checksum을 제공하지 않으므로 이번처럼 실제 `statements` 본문을 확인하지 않고 이름 일치만으로 동일성을 추정하지 않는다.

Legacy Link cleanup 뒤 production catalog의 `public.closet_*` table 16개와 RLS 16개를 확인했다. 아래 전체 RPC 목록은 최초 감사 이후 cleanup 기록을 누적한 문서다.

## 3. 공통 규칙

- 현재 16개 table 모두 RLS가 켜져 있다.
- 모든 table의 `workspace_id`는 `public.workspaces(id)`를 참조한다.
- 업무 데이터의 일반적인 source of truth는 table이다. Storage의 실제 이미지 binary는 `closet-images` bucket이 원본이고, 이미지 table은 소유권·상태·경로의 source of truth다.
- `closet_item_stats`, `closet_outfit_stats`는 table이 아니라 계산 view다.

## 4. Table inventory

| Table | 한국어 이름 | 상태 | Source of truth | Rows | Total size |
|---|---|---|---|---:|---:|
| `closet_care_events` | Item 관리 이력 | `LIVE_CORE` | 예: 수동 관리 기록 | 23 | 80 kB |
| `closet_color_palette` | 색상 팔레트 | `LIVE_SUPPORT` | 예: 명명된 색상과 HEX | 22 | 80 kB |
| `closet_item_images` | Item 이미지 메타데이터 | `LIVE_SUPPORT` | 예: 이미지 경로·상태 | 511 | 536 kB |
| `closet_items` | 옷장 Item | `LIVE_CORE` | 예 | 455 | 616 kB |
| `closet_outfit_items` | Outfit 구성 Item | `LIVE_SUPPORT` | 예: Outfit 구성과 배치 | 2,443 | 1,072 kB |
| `closet_outfits` | Outfit | `LIVE_CORE` | 예 | 517 | 432 kB |
| `closet_place_hvac_profiles` | 장소별 냉난방 프로필 | `LIVE_CORE` | 예: 수동 Place Profile | 10 | 48 kB |
| `closet_places` | 장소 선택지 | `LIVE_SUPPORT` | 예 | 25 | 80 kB |
| `closet_purchase_events` | Item 재구매 이력 | `LIVE_CORE` | 예: 수동 재구매 기록 | 11 | 72 kB |
| `closet_replacement_line_edges` | 계보 방향 연결 | `LIVE_CORE` | 예: 현재 계보 연결 | 119 | 280 kB |
| `closet_replacement_line_items` | Line membership | `LIVE_SUPPORT` | 예 | 194 | 200 kB |
| `closet_replacement_line_starts` | 명시적 계보 시작점 | `LIVE_SUPPORT` | 예 | 50 | 72 kB |
| `closet_replacement_lines` | Replacement Line | `LIVE_CORE` | 예 | 66 | 168 kB |
| `closet_transport_modes` | 교통수단 선택지 | `LIVE_SUPPORT` | 예 | 4 | 80 kB |
| `closet_wear_logs` | 착용 기록 | `LIVE_CORE` | 예 | 808 | 1,048 kB |
| `closet_weather_locations` | 날씨 위치 | `LIVE_SUPPORT` | 예 | 1 | 96 kB |

### 4.1 `closet_color_palette`

- 주요 columns: `id`, `display_name`, `display_hex`, `semantic_color`, timestamps.
- foreign keys: 공통 `workspace_id` FK 외 업무 FK 없음. `closet_items.palette_id`가 이 table을 참조한다.
- 읽기: `src/data/supabase/items.ts`, `src/data/supabase/snapshot.ts`의 Item join.
- 쓰기: 현재 앱 repository에는 팔레트 자체 편집이 없다. 초기 값은 완료된 Notion migration에서 기록했으며 active import writer는 제거했다. Item 편집은 `palette_id`를 선택한다.
- trigger/dependency: Item FK가 삭제를 막는다.
- 유지 이유와 cleanup: 현재 Item 색상 이름과 HEX의 공통 사전이므로 유지한다. 다만 22개 팔레트 row는 현재 12개 Line category와 1:1로 같지 않으므로 Line category FK로 억지로 재사용하지 않는다. 기존 HEX는 직접 지정 UI의 제안·표시 자료로 활용할 수 있다.

### 4.2 제거 기록 — `closet_import_runs`

- 2026-07-26 초기 Notion import의 성공 기록 2행을 담았고 현재 frontend·repository·RPC·trigger가 읽거나 쓰지 않았다.
- 2026-08-25 local-only JSON export와 row fingerprint, schema rollback, 별도 data restore SQL을 준비하고 active import writer를 먼저 제거했다.
- 외부 dependency와 활성 lock 0건을 재확인한 뒤 remote migration `20260825021515_remove_closet_import_runs`로 table·소유 index·RLS policy·grant를 제거했다.
- 감사 기준선과 복구 절차는 [`database-cleanup-plan.md`](./database-cleanup-plan.md), `supabase/rollback/remove_closet_import_runs_rollback.sql`, ignored `data/local-exports/`에 보존한다.

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
- trigger/dependency: `closet_item_images`, `closet_outfit_items`, `closet_replacement_line_items`와 `closet_item_stats` view가 삭제를 막거나 참조한다.
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

- production 주요 columns: predecessor/successor Item, `branch_name`, `decision_reason`, `status`, confirmation metadata. 과도기 `source_kind`, `source_legacy_link_id`는 Wave 3에서 제거했다.
- foreign keys: predecessor·successor는 같은 Line membership을 참조한다. Legacy Link FK와 source 전용 constraint·index는 없다.
- 읽기: `src/data/supabase/replacement-lines.ts`와 Lineage 화면이 현재 계보 의미에 필요한 방향·Line·설명·상태 metadata를 읽는다.
- 쓰기: manual create, detail/connection edit, disconnect, reverse, move/merge RPC.
- trigger/dependency: `require_active_closet_replacement_line_edge`, Legacy-free `validate_closet_replacement_line_edge`. 현재 119개 모두 confirmed이고 source 분류 없이 독립 edge다.
- 유지 이유와 cleanup: 현재 계보의 단일 source of truth다. Wave 3 migration은 기존 18개 Legacy 출처 edge의 ID·방향·Line·설명·확정 metadata를 보존한 채 source association만 제거했다.

### 4.15 `closet_replacement_line_starts`

- 주요 columns: `replacement_line_id`, `item_id`, `designated_at`, `designated_by`.
- foreign keys: `(workspace_id, replacement_line_id, item_id)`가 Line membership을 참조하고 지정자는 `auth.users`를 참조한다.
- 읽기: `src/data/supabase/replacement-lines.ts`, Lineage 화면.
- 쓰기: start 지정, edge disconnect, Item 이동·Line 병합 RPC.
- trigger/dependency: `require_active_closet_replacement_line_start`; edge와 동시에 시작점이 되지 않도록 RPC가 검증한다.
- 유지 이유와 cleanup: graph만으로 추정할 수 없는 명시적 G0의 source of truth다.

### 4.16 제거 기록 — `closet_replacement_legacy_links`

- 제거 전에는 Item A/B, source Notion IDs, review status/decision/reason, reviewer와 timestamps를 가진 49개 reviewed Link를 보존했다.
- client-first cleanup에서 전용 repository method와 숨은 Legacy review·edge preview route를 먼저 제거했다.
- 49개 Link와 18개 source association은 local-only JSON·CSV로 export하고 schema rollback·data restore를 준비했다.
- remote migration `20260827122033`에서 edge 18개를 독립 edge로 전환한 뒤 table, review/confirm RPC와 invalidation trigger/helper를 제거했다.

### 4.17 제거 기록 — `closet_replacement_legacy_link_revisions`

- 제거 전에는 `legacy_link_id`, `revision_number`, 판단·사유·reviewer·timestamp를 가진 51개 이력이 있었고 orphan은 0개였다.
- 51개 전부를 Link와 같은 snapshot의 local-only JSON·CSV로 export했다.
- Legacy-free reverse 구현을 먼저 검증한 뒤 remote migration `20260827122033`에서 revise RPC와 revision table을 Legacy Link table보다 먼저 제거했다.

### 4.18 `closet_purchase_events`

- 주요 columns: `item_id`, `purchased_on`, `quantity`, timestamps.
- 읽기·쓰기: `src/data/supabase/purchases.ts`와 Item 상세·통계가 이력을 읽고, 제한된 create RPC와 member-scoped update/delete가 기록을 관리한다.
- dependency: Item 소유권 복합 FK와 날짜·수량 검증이 있으며 Item 삭제 시 함께 제거된다.
- 유지 이유와 cleanup: 수동 재구매 사건의 source of truth이므로 유지한다.

### 4.19 `closet_care_events`

- 주요 columns: `item_id`, `cared_on`, `care_method`, timestamps.
- 읽기·쓰기: `src/data/supabase/care.ts`와 Item 관리 UI가 이력을 직접 조회·생성·수정·삭제한다.
- dependency: Item 소유권 복합 FK와 날짜·관리 방식 검증이 있으며 Item 삭제 시 함께 제거된다.
- 유지 이유와 cleanup: 손세탁·드라이클리닝 사건의 source of truth이므로 유지한다.

### 4.20 `closet_place_hvac_profiles`

- 주요 columns: `place_id`, `season`, 예상 HVAC mode·intensity, `source`, `last_confirmed_on`.
- 읽기·쓰기: snapshot·Place HVAC repository와 설정 화면이 specific venue의 계절별 예상값을 조회·관리한다.
- dependency: Place 소유권 복합 FK, season·mode·intensity·source check와 member RLS가 있다.
- 유지 이유와 cleanup: 수동 Place Profile의 source of truth이므로 유지한다.

## 5. Public Closet RPC inventory

모든 함수는 production `public` schema의 현재 signature를 기준으로 기록했다. `UI`의 “간접”은 frontend가 Edge Function이나 상위 RPC를 호출하고 해당 함수가 내부에서 실행된다는 뜻이다.

`clone_closet_outfit(uuid, uuid, uuid, text)`은 2026-08-25 remote migration `20260824180057_remove_outfit_clone_rpc`로 제거되어 현재 inventory에서 제외했다. 감사 기준선과 복구 SQL은 [`database-cleanup-plan.md`](./database-cleanup-plan.md)와 `supabase/rollback/remove_outfit_clone_rpc_rollback.sql`에 보존한다.

Legacy review/revise와 singular·batch confirm RPC 네 개는 2026-08-27 remote migration `20260827122033_remove_replacement_legacy_link_subsystem`으로 제거되어 현재 inventory에서 제외했다. 현재 Replacement Line RPC는 edge table을 단일 source of truth로 사용한다.

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
| `create_closet_replacement_manual_edge(workspace, line, predecessor, successor, branch, reason)` | `createManualEdge`; Lineage UI | edges | membership·start·cycle 검증과 edge 생성 | 필요 |
| `create_closet_replacement_line(workspace, name, style_identity, color_category)` | `create`; Replacement Lines 상단 신규 Line UI | lines | 인증된 workspace에 사람이 지정한 metadata로 active·빈 Line 생성 | 필요 |
| `revise_closet_replacement_line_edge_details(workspace, edge, expected_updated_at, branch, reason)` | 현재 frontend public port·adapter·production UI caller 없음; DB RPC와 migration만 보존 | edges | optimistic lock과 설명 변경 | frontend-unused; DB 계약 보존 |
| `update_closet_replacement_line_edge_connection(workspace, edge, expected_updated_at, predecessor, branch, reason)` | `updateEdgeConnection`; Lineage UI | edges, line_items | predecessor 변경·cycle·membership 검증 | 필요 |
| `disconnect_closet_replacement_line_edge(workspace, edge, expected_updated_at)` | `disconnectEdge`; Lineage UI | edges, starts | edge 해제와 successor의 start 전환 | 필요 |
| `reverse_closet_replacement_line_edge(workspace, edge, expected_updated_at)` | `reverseEdge`; Lineage UI | edges | 방향과 optimistic lock timestamp를 edge에서 원자 변경 | 필요; Legacy-free production 구현 |
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
