# Closet Index Phase 1 Data & Security Spec

- 최종 수정일: 2026-07-26
- 상태: 구현 기준선
- 구현 SQL: `supabase/migrations/20260726012934_create_closet_index_phase1_schema.sql`
- FK index SQL: `supabase/migrations/20260726013146_add_closet_foreign_key_indexes.sql`
- 계약 테스트: `supabase/tests/phase1_schema_contract_test.sql`

## 1. 범위

이 문서는 Phase 1A 앱, Notion 이전, Phase 1B 이미지 확장을 함께 지탱하는 데이터 계약을 고정한다.

공용 Supabase 프로젝트 `mworkroom`(`ddlwainwollvpaeccpty`)에 적용한다. Closet Index는 별도 프로젝트를 만들지 않고 전용 workspace `00000000-0000-0000-0000-000000000003`을 사용한다.

## 2. 소유권 원칙

- 모든 개인 데이터 행은 `workspace_id`로 Closet Index workspace에 귀속된다.
- 브라우저는 `service_role` 키를 사용하지 않는다.
- 로그인한 사용자가 공용 `workspace_members`에 등록되어 있어야 한다.
- `000…0002` inventory workspace와 동일한 두 membership을 `000…0003`에 재사용한다.
- relation 테이블과 Wear Log는 복합 외래 키로 양쪽 행의 소유자가 같은지 검사한다.
- 삭제는 과거 기록을 훼손하지 않도록 기본적으로 `restrict`를 사용하고, 순수 연결 행만 필요한 곳에서 `cascade`를 사용한다.

## 3. 테이블

| 테이블 | 역할 | Phase 1 브라우저 권한 |
|---|---|---|
| `workspaces` / `workspace_members` | 공용 로그인 접근 계약 | 기존 구조 재사용 |
| `closet_color_palette` | Notion 커스텀 아이콘과 HEX 매핑 | 읽기 |
| `closet_items` | 개별 아이템 | 읽기, `rain_ok`·`long_walk_ok`만 수정 |
| `closet_outfits` | 고정된 아이템 조합과 Rating | 읽기 |
| `closet_outfit_items` | Outfit–Item relation | 읽기 |
| `closet_places` | 고정 장소 선택지 | 읽기 |
| `closet_transport_modes` | 고정 교통수단 선택지 | 읽기 |
| `closet_wear_logs` | 실제 착용 기록 | 읽기·생성·수정·삭제 |
| `closet_replacement_lines` | 교체 계보 | 읽기, UI 비노출 |
| `closet_replacement_line_items` | Replacement Line–Item relation | 읽기, UI 비노출 |
| `closet_item_images` | Phase 1B 이미지 메타데이터 | 읽기 |
| `closet_outfit_previews` | Phase 1B 합성 이미지 메타데이터 | 읽기 |
| `closet_import_runs` | 이전 실행 결과 | 읽기 |

## 4. 핵심 데이터 계약

### 4.1 Outfit Rating

`closet_outfits.rating`은 다음 중 하나인 단일 값이다.

```text
favorite | ok | error | null
```

- `Favorite > OK > Error`는 선호 순위다.
- `Favorite`는 `OK + boolean`으로 분리하지 않는다.
- Wear Log의 thermal feeling `ok`와 Outfit Rating `ok`는 다른 도메인 값이다.

### 4.2 Wear Log

- PK는 UUID `id`다.
- `worn_on + outfit_id`에는 unique constraint가 없다.
- 따라서 같은 날짜·같은 Outfit도 여러 번 기록할 수 있다.
- `submission_token`만 사용자별 unique다. 한 번의 폼 제출이 네트워크 재시도로 반복되는 경우만 멱등 처리한다.
- 시간 컬럼은 두지 않는다. 같은 날짜 기록 사이의 실제 시간순서는 보장하지 않는다.
- 온도는 섭씨 정수 `-50..60` 범위다.
- `temp_back`이 Notion에서 비었고 `temp_out`이 있으면 이전 시 같은 값으로 채우고 `temp_back_inferred = true`로 기록한다.
- 새 앱 폼에서 귀가 온도를 비우면 저장값은 `null`일 수 있으며 추천 계산에서 출발 온도를 대신 사용한다.
- `feeling_out`, `feeling_back`은 `cold | ok | hot | null`이다.
- `rain_condition`, `long_walk_condition`은 `no | yes | unknown`이다.

### 4.3 계산 View

`closet_outfit_stats`와 `closet_item_stats`는 원본 relation과 Wear Log에서 다음 값을 계산한다.

- 착용 횟수
- 마지막 착용일

두 View는 `security_invoker = true`여서 호출자의 RLS 범위를 그대로 따른다.

## 5. 권한과 RLS

### 5.1 명시적 권한

- `anon`에는 앱 테이블 권한을 부여하지 않는다.
- `authenticated`에는 필요한 테이블의 `SELECT`만 부여한다.
- `items`의 `UPDATE`는 `rain_ok`, `long_walk_ok`, `updated_at` 컬럼으로 제한한다.
- `wear_logs`는 앱 폼에 필요한 컬럼만 `INSERT`·`UPDATE`할 수 있다.
- Outfit·Item·Replacement Line 생성·삭제 권한은 Phase 1 브라우저에 주지 않는다.

### 5.2 RLS 패턴

모든 public 테이블에서 RLS를 활성화한다.

```sql
(select private.is_workspace_member(workspace_id))
```

- `SELECT`, `INSERT`, `UPDATE`, `DELETE`별 정책을 분리한다.
- `UPDATE` 정책에는 `USING`과 `WITH CHECK`를 모두 둔다.
- 모든 앱 쿼리에도 `.eq('workspace_id', '000…0003')` 필터를 명시한다.
- 복합 workspace 외래 키가 RLS를 우회한 잘못된 relation도 막는다.

## 6. 인증

- Supabase Auth의 Google OAuth와 PKCE를 사용한다.
- 최초 로그인만으로 접근을 허용하지 않는다.
- 공용 `workspace_members`에서 Closet Index workspace membership을 확인한다.
- 허용되지 않은 계정은 앱 화면에서 데이터 없이 거부되고, RLS에서도 다시 거부된다.
- 로컬 데모 모드는 Auth와 원격 DB 없이 흐름 검증에만 사용한다.

## 7. Storage

Phase 1A는 실제 옷 이미지를 사용하지 않으므로 Storage bucket을 만들지 않는다.

Phase 1B 시작 전에 다음을 별도 migration으로 확정한다.

- bucket 이름과 public/private 여부
- `workspace_id/item_id` 기반 경로 규칙
- MIME type, 파일 크기, 픽셀 제한
- 원본·누끼·Outfit preview별 쓰기 주체
- signed URL 또는 public URL 사용 방식
- 객체 정책과 메타데이터 행의 소유권 일치

규칙이 정해지기 전에는 임시 bucket이나 넓은 Storage 정책을 만들지 않는다.

## 8. 추천 규칙

Phase 1 추천은 통계 모델이나 생성형 AI가 아니라 설명 가능한 결정 규칙이다.

### 8.1 후보 제외

다음 Outfit은 기본 추천에서 제외한다.

- `rating = error`
- Retired Item 포함
- Item relation이 하나도 없는 Outfit

### 8.2 온도 계산

```text
temp_back_effective = temp_back ?? temp_out
target_temp = (temp_out + temp_back_effective) / 2
```

Outfit의 Wear Log에서 `feeling = ok`인 출발·귀가 관측을 모은다. 같은 로그에서 온도와 체감이 완전히 같은 출발·귀가 관측은 한 번만 센다.

```text
ok_range.min = minimum(ok temperatures) - 2°C
ok_range.max = maximum(ok temperatures) + 2°C
```

### 8.3 경고

- 목표 출발·귀가 온도가 과거 `cold` 관측 온도 이하이면 추움 경고
- 목표 출발·귀가 온도가 과거 `hot` 관측 온도 이상이면 더움 경고
- 비가 `yes`일 때 `rain_ok = false`인 Item이 있으면 조건 경고
- 오래 걷기가 `yes`일 때 `long_walk_ok = false`인 신발이 있으면 조건 경고

### 8.4 단계

| 단계 | 조건 |
|---|---|
| 추천 높음 | 목표 온도가 OK 범위 안이고 조건 충돌이 없음 |
| 추천 가능 | 결정적 충돌은 없지만 온도 근거가 없음 |
| 주의 | 온도 위험·부적합 Item이 있거나 OK 범위에서 2°C 초과 이탈 |

착용 기록이 0회인 Outfit은 삭제하거나 추천에서 숨기지 않고 `untried` 근거 상태로 분리한다. HOME에서는 `새 착장 시험해보기` 영역에 표시하며, 첫 Wear Log가 생기면 별도 상태 변경 없이 `observed`로 계산된다. 실제 온도 근거가 없다는 사실을 명시하고 기존 Outfit의 기록으로 조용히 확정값을 만들지 않는다.

정렬 순서:

1. 추천 단계
2. OK 범위와 목표 온도 사이 거리
3. Rating `Favorite > OK > 미입력`
4. 착용 근거가 많은 Outfit
5. 최근 착용한 Outfit
6. UUID 안정 정렬

장소와 교통수단은 일치 이력을 근거로 표시하지만 Phase 1 초기 점수에는 가중치를 주지 않는다.

## 9. 검증

pgTAP 계약 테스트는 다음을 검사한다.

- Closet Index 테이블 12개의 RLS 활성화
- 명시적 권한
- Rating·온도·체감 제약
- 소유자 일치 외래 키
- 같은 날짜·같은 Outfit 복수 Wear Log
- 다른 사용자 데이터 차단
- 통계 View와 핵심 index

현재 개발 PC에는 Docker가 없어 로컬 Supabase 재구성과 pgTAP 실행은 아직 수행하지 못했다. SQL 파일은 생성되어 있으며 Docker 또는 격리된 CI 환경이 준비되면 다음 명령으로 검증한다.

```powershell
npx supabase start
npx supabase db reset
npx supabase test db
```
