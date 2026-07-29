# Closet Index Phase 3 원격 적용 Runbook

- 작성일: 2026-07-29
- 대상 Supabase 프로젝트: `mworkroom` (`ddlwainwollvpaeccpty`)
- 범위: P3-1 Item·Outfit 쓰기 계약, P3-3 cutout 업로드 계약, `closet-item-image` Edge Function
- 현재 상태: 원격 미적용, 읽기 전용 사전 점검 완료

## 1. 적용 전 기준선

2026-07-29 읽기 전용 조회 결과는 다음과 같다.

| 항목 | 기준선 |
| --- | ---: |
| `closet_items` | 451 |
| `closet_outfits` | 507 |
| `closet_outfit_items` | 2,401 |
| `closet_wear_logs` | 784 |
| `closet_item_images` | 56 |
| `closet_item_images` ready / pending / error | 56 / 0 / 0 |
| `closet_outfit_previews` ready | 1 |
| `closet-images` Storage 객체 | 57 |
| 고아 이미지 metadata | 0 |
| ready metadata의 누락 Storage 객체 | 0 |

Phase 3 column, RPC, `closet-item-image` Edge Function은 아직 원격에 없다. 기존 이미지 고유 인덱스는 `closet_item_images_one_active_variant_idx`이며, `pending`과 `ready`를 함께 한 개로 제한한다.

최근 Storage 객체 metadata에는 `mimetype`과 `size`가 실제로 저장되어 있다. P3-3 finalize RPC가 검사하는 `image/webp` MIME과 700KB 상한은 현재 Storage metadata 형식과 호환된다.

## 2. Docker 없는 검증 선택지

Docker는 원격 migration과 Edge Function 배포에 필요하지 않다.

격리된 실제 PostgreSQL에서 pgTAP을 실행하려면 다음 중 하나를 선택한다.

1. Supabase 개발 브랜치를 생성하고 migration 및 pgTAP을 적용한다. production data는 복사되지 않으며, 브랜치 비용 확인이 먼저 필요하다.
2. GitHub Actions의 일회성 Supabase 환경에서 migration reset과 pgTAP을 실행한다. workflow를 push해야 하므로 commit·push 승인이 먼저 필요하다.
3. 격리 DB 검증을 생략하고 production에 직접 적용한다. 이 경우 이 문서의 사전 점검, 적용 직후 검증, rollback 조건을 모두 지켜야 한다.

권장 순서는 1번 또는 2번으로 SQL 계약을 먼저 실행 검증한 뒤 production에 적용하는 것이다.

### 2.1 선택 결과

Free Plan에서는 Supabase Branching을 사용할 수 없어 GitHub Actions 일회성 환경을 선택했다.

- 브랜치: `codex/phase3-isolated-validation`
- workflow: `.github/workflows/phase3-supabase-contracts.yml`
- Supabase CLI: `2.109.1`
- 최종 실행: `https://github.com/mworkroom/closet-index/actions/runs/30414022285`
- 결과: P3-1 37개 + P3-3 15개, 총 52개 pgTAP 통과

첫 실행에서는 빈 CI DB에 production의 공용 `workspaces`, `workspace_members`, `private.is_workspace_member(uuid)` 계약이 없어 migration이 의도대로 중단됐다. Production 계약을 읽기 전용으로 확인한 뒤 `supabase/test-support/shared_workspace_fixture.sql`을 만들고, CI runner에서만 가장 이른 임시 migration으로 복사하도록 했다.

두 번째 실행에서는 전체 migration과 P3-3 15개가 통과했고, P3-1은 pgTAP 버전별 `is_null(text, unknown)` overload 차이로 33개 뒤 중단됐다. 반환 row의 존재와 `rating is null`을 함께 확인하는 `ok(exists (...))` assertion으로 바꾼 뒤 최종 실행에서 52개가 모두 통과했다.

## 3. Production 적용 순서

### 3.1 승인 경계

다음 작업은 production schema와 원격 Function 상태를 변경하므로 J의 명시적 승인을 받은 뒤에만 실행한다.

- `20260729000405_phase3_item_outfit_write_contract.sql` 적용
- `20260729003410_phase3_item_image_upload_contract.sql` 적용
- `closet-item-image` Edge Function 배포
- 실제 Item을 사용한 cutout 등록·교체 검증
- 웹 앱 commit·push·배포

### 3.2 사전 점검

적용 직전에 다음 조건을 다시 확인한다.

- 프로젝트 상태가 `ACTIVE_HEALTHY`이다.
- 원격 migration 목록에 두 Phase 3 migration이 없다.
- Phase 3 column과 RPC가 없다.
- `closet-item-image` Function이 없다.
- Item 451, Outfit 507, relation 2,401, 이미지 metadata 56, Storage 객체 57 기준선이 예상하지 못하게 변하지 않았다.
- 이미지 pending/error, 고아 metadata, 누락 Storage 객체가 모두 0이다.
- `closet_item_images_one_active_variant_idx`가 존재한다.

기준선이 달라졌다면 적용을 멈추고 변경 원인을 먼저 확인한다.

### 3.3 Database migration

다음 순서로 한 개씩 적용한다.

1. `phase3_item_outfit_write_contract`
2. `phase3_item_image_upload_contract`

첫 migration 적용 후 다음을 확인한 뒤 두 번째 migration으로 넘어간다.

- `closet_items.display_hex`가 `NOT NULL`이고 모든 값이 HEX 형식이다.
- `closet_outfits.archived_at`, `closet_outfit_previews.stale_at`가 생성됐다.
- ready 전용 고유 인덱스가 생성되고 기존 active 인덱스가 제거됐다.
- Item INSERT·UPDATE와 Outfit UPDATE 권한이 의도한 column에만 추가됐다.
- 공개 Outfit RPC는 `anon`이 실행할 수 없고 `authenticated`만 실행할 수 있다.
- 내부 helper는 `public`, `anon`, `authenticated`가 직접 실행할 수 없다.

두 번째 migration 적용 후 다음을 확인한다.

- begin/finalize/cancel 이미지 RPC는 `service_role`만 실행할 수 있다.
- `public`, `anon`, `authenticated`에는 실행 권한이 없다.
- 기존 이미지 metadata와 Storage 객체 수가 바뀌지 않았다.

### 3.4 Advisor 비교

Security 및 Performance Advisor를 다시 실행한다.

- 기존 경고는 Phase 3 적용 전 기준선과 분리한다.
- 공개 Outfit RPC는 `SECURITY DEFINER`이므로 authenticated 실행 경고가 발생할 수 있다. 이는 relation 직접 INSERT를 열지 않고 transaction RPC에서 workspace membership을 재검증하기 위한 의도된 예외이다.
- 이미지 RPC가 anon 또는 authenticated 실행 가능 경고로 나타나면 배포를 중단하고 즉시 rollback한다.
- Phase 3 테이블에 RLS 없음, 과도한 권한, mutable search path 경고가 새로 생기면 배포를 중단한다.

### 3.5 Edge Function

Database 검증을 통과한 뒤 `closet-item-image`를 `verify_jwt=true`로 배포한다.

배포 직후에는 production 데이터를 쓰지 않는 검증만 먼저 수행한다.

- Function 목록에서 `ACTIVE`, `verify_jwt=true`를 확인한다.
- Authorization header가 없는 호출이 401로 거절되는지 확인한다.
- 유효한 사용자 JWT와 잘못된 body를 보냈을 때 Function handler의 400 응답까지 도달하는지 확인한다.
- Function log에 초기화·import 오류가 없는지 확인한다.

실제 cutout 등록·교체 검증은 J가 지정한 Item과 파일로만 수행한다. 이 검증은 metadata와 Storage 객체를 실제로 변경하므로 별도 승인 경계이다.

### 3.6 웹 앱 공개

Database와 Function 검증이 끝난 뒤에만 웹 앱을 commit·push·배포한다. migration 또는 Function만 적용된 상태를 앱 공개 완료로 기록하지 않는다.

## 4. Rollback

SQL rollback 파일은 `supabase/rollback/phase3_remote_contract_rollback.sql`이다.

rollback은 다음 조건에서만 실행 가능하다.

- Phase 3 Item 생성·수정, Outfit 생성·복제·보관, cutout 등록·교체가 한 번도 실행되지 않았다.
- 기준선 수량과 이미지 무결성이 그대로다.
- `closet-item-image` Function을 먼저 비활성화하거나 제거해 신규 요청을 차단했다.

rollback SQL은 production 기준선 수량을 guard로 사용한다. 하나라도 다르면 transaction을 중단하며 임의로 데이터를 삭제하거나 보정하지 않는다.

Phase 3 쓰기가 이미 발생했다면 column 제거와 인덱스 복원을 실행하지 않는다. 먼저 변경 레코드와 이미지 객체를 읽기 전용으로 조사한 뒤, 보존 migration을 별도로 설계한다.

## 5. Production 적용 결과

2026-07-29 J의 명시적 승인에 따라 다음 순서로 production 적용과 비쓰기 검증을 완료했다.

1. `phase3_item_outfit_write_contract` 적용
   - 원격 migration version: `20260729013427`
   - `display_hex`, `archived_at`, `stale_at`, ready 전용 이미지 고유 인덱스, Item·Outfit 권한과 RPC를 확인했다.
   - Item 451개 모두 `display_hex`가 `NOT NULL`이며 유효한 6자리 HEX였다.
2. `phase3_item_image_upload_contract` 적용
   - 원격 migration version: `20260729013547`
   - begin/finalize/cancel RPC는 `service_role`만 실행 가능하고 `public`, `anon`, `authenticated`는 실행할 수 없음을 확인했다.
3. Advisor 비교
   - Phase 3 이미지 RPC 관련 새 보안 경고는 없었다.
   - Outfit RPC 3개에는 예상한 `authenticated SECURITY DEFINER` 경고가 생겼다. 각 RPC는 transaction 단위 관계 쓰기를 위해 사용하며, 함수 내부에서 로그인과 workspace membership을 다시 검사한다.
   - Performance Advisor에는 Phase 3 배포를 막는 새 경고가 없었다. 기존 다른 앱·백업 schema·미사용 인덱스 안내는 이번 범위에서 변경하지 않았다.
4. `closet-item-image` Edge Function 배포
   - version `1`, 상태 `ACTIVE`, `verify_jwt=true`
   - 관련 Vitest 3파일·8개 테스트와 TypeScript 검사를 통과했다.
   - 인증 헤더 없는 production POST는 `401 UNAUTHORIZED_NO_AUTH_HEADER`로 거절됐고 Edge 로그에도 version 1의 POST 401이 기록됐다.

최종 데이터 기준선은 Item 451개, Outfit 507개, Outfit 관계 2,401개, Wear Log 784개, 이미지 metadata 56개, ready 이미지 56개, Storage 객체 57개로 적용 전과 같다. pending/error 이미지, 고아 metadata, ready metadata의 누락 Storage 객체, 잘못된 `display_hex`는 모두 0개다.

실제 cutout 등록·교체는 production metadata와 Storage 객체를 변경하므로 이번 비쓰기 검증에서 실행하지 않았다. 웹 앱 commit·push·배포도 별도 단계로 남아 있다.
