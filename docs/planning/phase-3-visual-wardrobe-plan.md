# Closet Index Phase 3 Visual Wardrobe Expansion Plan

- 작성일: 2026-07-29
- 상태: P3-0 완료, P3-1 로컬 구현 시작
- 목표 릴리스: Phase 3 Visual Wardrobe Expansion
- 선행 상태: Phase 2 구현·공개·실제 Wear Log 경로 검증 완료
- 관련 문서: [Roadmap](./roadmap.md), [Product Plan](./product-plan.md), [Phase 1B Plan](./phase-1b-plan.md), [Image Spec](./phase-1b-image-spec.md), [Phase 2 Weather Plan](./phase-2-weather-plan.md)

## 1. 목표

Phase 3의 목표는 대표 착장에 한정된 시각 경험을 앱 안의 실제 옷장 관리 흐름으로 확장하는 것이다.

```text
새 Item 등록
→ 필요하면 누끼 이미지 등록
→ 기존 Item과 함께 새 Outfit 구성
→ 위치·크기 미리보기
→ 새 고정 조합으로 저장
→ HOME·LOOKBOOK·착용 기록에서 즉시 사용
```

Phase 3는 AI가 임의의 코디를 생성하는 단계가 아니다. J가 직접 선택한 Item 조합을 안전하게 새 Outfit으로 저장하고, 이미 검증된 추천·Wear Log 흐름에서 사용할 수 있게 하는 단계다.

## 2. 현재 기준선

Phase 3는 다음 구현을 그대로 이어받는다.

- Supabase가 Closet Index의 쓰기 원본이며 Notion은 읽기 전용 보관본이다.
- Item, Outfit, Outfit relation, Wear Log는 UUID로 연결된다.
- Outfit은 변경되지 않는 하나의 Item 조합이다.
- 기존 Outfit의 표시 방식·위치·크기 보정은 가능하지만 Item 구성 변경은 새 Outfit 생성으로 처리한다.
- Item cutout과 Outfit preview는 private `closet-images` Storage에 저장한다.
- 앱은 ready metadata만 읽고 signed URL 만료·객체 오류 시 스와치 fallback을 유지한다.
- 누끼는 alpha trim, 2.5% 안전 여백, 카테고리 슬롯, composition v4 규칙으로 합성한다.
- 이미지가 추천 순위나 착용 통계를 바꾸지 않는다.
- 고해상도 원본은 기본적으로 원격에 저장하지 않는다.

현재 빠져 있는 기능:

- Item 생성과 일반 정보 편집
- 앱 안에서 Item cutout 등록·교체
- Outfit 생성과 기존 Outfit 복제
- Outfit relation의 트랜잭션 단위 저장
- 새 Outfit의 preview 생성·캐시
- 잘못 만든 Outfit의 보관·복원
- 이미지와 relation 이상을 찾는 관리 상태

## 3. 범위

### 3.1 포함

- 새 Item 등록
- Item 이름·카테고리·색상·계절·구매일·메모·적합성 편집
- Item cutout 등록·교체·재시도
- 이미지 없는 Item의 정상 저장과 스와치 fallback
- Closet의 이미지 없음 필터와 등록 상태 표시
- 빈 화면에서 새 Outfit 만들기
- 기존 Outfit을 복제해 새 Outfit 만들기
- Item 검색·필터·선택과 실시간 composition 미리보기
- Outfit 이름·초기 평가·위치·크기 설정
- 같은 Item 조합의 기존 Outfit 사전 경고
- 새 Outfit과 relation의 원자적 저장
- 새 Outfit preview 생성·캐시
- 잘못 만든 Outfit의 보관·복원
- 생성된 Item·Outfit을 현재 HOME·LOOKBOOK·FAVORITE·Wear Log 흐름에 연결
- workspace membership 기반 쓰기 권한과 Storage 업로드 경계
- 이미지·relation 이상 상태의 탐지와 안전한 재시도

### 3.2 제외

- AI 코디 추천 또는 생성형 이미지
- 자동 배경 제거 품질을 Phase 3 완료 조건으로 삼는 작업
- 자유 드래그 기반 캔버스 편집기
- 기존 Outfit의 Item relation 직접 변경
- 과거 Wear Log의 Outfit을 다른 Outfit으로 일괄 교체
- Retired 과거 데이터의 이미지 전체 보충
- 모든 기존 Item 451개의 이미지 일괄 완성
- 고해상도 원본 사진의 원격 장기 보관
- Item·Outfit의 일반적인 영구 삭제 UI
- 공유 옷장, 가족 계정, 공개 프로필
- 세탁·Replacement Line·알림·고급 통계

마지막 세 항목은 Phase 4 범위다.

## 4. 제품 결정

### 4.1 쓰기 원본

새 Item·Outfit·이미지는 Supabase에 직접 저장한다. Notion에는 복사하거나 양방향 동기화하지 않는다.

새 앱 데이터는 `notion_page_id = null`을 정상 상태로 사용한다. Notion ID가 없다는 이유로 미완성 데이터로 취급하지 않는다.

### 4.2 Item 등록

첫 Item 등록 화면의 입력은 다음과 같다.

| 필드 | 규칙 |
|---|---|
| 이름 | 필수, 앞뒤 공백 제거 |
| 카테고리 | 필수, 기존 카테고리 목록에서 선택 |
| 색상 카테고리 | 필수 선택 또는 명시적인 `미지정` |
| fallback 색상 | 필수, 이미지가 없거나 실패할 때 사용할 HEX |
| 계절 | 복수 선택, 선택하지 않으면 `계절 미지정`으로 명시 |
| 구매일 | 선택 |
| 메모 | 선택 |
| 비 적합성 | 기본값은 현재 일반 규칙 사용 |
| 장거리 걷기 | 신발만 현재 일반 규칙 사용, 나머지는 해당 없음 |
| Retired | 새 Item은 항상 false |
| 이미지 | 선택, Item을 먼저 저장한 뒤 별도 단계로 등록 가능 |

동일한 이름이 있어도 UUID가 다르면 별도 Item이므로 저장을 막지 않는다. 다만 저장 전에 같은 이름·카테고리의 Item이 있으면 확인 경고를 표시한다.

### 4.3 이미지 등록

첫 앱 내 업로드는 배경이 투명한 PNG 또는 WebP cutout을 기준으로 한다.

- iPhone 촬영본, 과거 앱 캡처, 쇼핑몰 이미지 등 원본 출처는 제한하지 않는다.
- 최종 cutout에서 Item 전체와 주요 색·형태를 알아볼 수 있으면 충분하다.
- 자동 배경 제거는 편의 기능 후보이며 Item 등록의 선행 조건이 아니다.
- 이미지 준비가 어렵거나 업로드가 실패하면 Item은 이미지 없이 저장하고 나중에 다시 등록할 수 있다.
- 브라우저에서 alpha trim·안전 여백·크기 제한·WebP 변환을 수행한 결과만 원격에 올린다.
- 원본 JPEG·HEIC·고해상도 PNG는 기본적으로 원격에 올리지 않는다.
- 최종 cutout은 700KB를 넘으면 업로드를 차단하고 다시 최적화한다.

### 4.4 Outfit 동일성과 복제

Outfit의 Item 조합은 저장 후 불변이다.

- 이름과 평가 변경은 가능하다.
- Item 표시 방식·위치·크기 변경은 가능하다.
- Item 추가·제거·교체는 기존 Outfit을 수정하지 않고 `이 착장으로 새로 만들기`로 처리한다.
- 복제 화면은 기존 Item과 표시 방식·위치·크기를 초기값으로 복사하지만 새 UUID를 사용한다.
- 새 조합 저장 전에 완전히 같은 Item UUID 집합의 Outfit이 있는지 확인한다.
- 같은 조합이 있으면 기존 Outfit을 보여 주고, J가 확인한 경우에만 별도 Outfit 저장을 허용한다.
- Outfit 이름은 선택이며 고유값이 아니다.
- 새 Outfit의 초기 평가는 `미입력`이다. 실제 착용 전에 자동으로 OK나 Favorite을 부여하지 않는다.

### 4.5 Outfit 만들기 화면

모바일에서는 다음 순서를 사용한다.

```text
현재 선택 Item 요약
→ 실시간 착장 미리보기
→ Item 검색·필터·추가
→ 선택 Item별 제거·표시 방식·위치·크기
→ 이름과 저장 검토
```

Item 선택 기능:

- 이름 검색
- 현재 계절 범위
- 상위 카테고리 그룹은 `Outer → Top → Bottom → Dress → Shoes → Bag → Acc` 순서로 표시
- `Socks`는 `Acc`에 포함하고, 독립 `Innerwear` Item은 선택 대상에서 제외
- `Top-T-shirts-innerwear`처럼 상위 접두사가 있는 상세 카테고리는 해당 상위 그룹에 포함
- 색상 카테고리
- 사용 중 Item 기본 표시
- Retired Item은 명시적으로 포함할 때만 표시
- 이미지 유무와 무관하게 선택 가능

한 Item은 한 Outfit에 한 번만 포함할 수 있다. Item을 제거하거나 순서를 바꿔도 저장 전까지 원격 데이터는 변경하지 않는다.

### 4.6 미리보기

새 Outfit 저장 직후에는 현재 Item cutout과 placement를 이용한 실시간 composition을 우선한다.

- 모든 핵심 cutout이 있으면 앱에서 즉시 합성 미리보기를 보여 준다.
- 일부 cutout만 있으면 준비된 Item만 표시하되 relation 전체는 유지한다.
- cutout이 없으면 스와치 fallback을 사용한다.
- 저장된 preview는 성능과 fallback을 위한 캐시이며 데이터 원본이 아니다.
- preview 생성 실패가 Outfit 저장을 실패로 바꾸지 않는다.
- relation, cutout, composition version이 바뀌면 해당 preview만 stale로 표시하고 다시 만들 수 있다.

### 4.7 삭제와 복구

Phase 3에서는 일반적인 영구 삭제 버튼을 만들지 않는다.

- 사용하지 않는 Item은 Retired로 전환한다.
- 잘못 만든 Outfit은 별도 보관 상태로 추천·기본 LOOKBOOK에서 제외하고 다시 복원할 수 있게 한다.
- `Error`는 실제로 입어 본 Outfit 만족도이므로 보관 상태로 재사용하지 않는다.
- Wear Log가 연결된 Item·Outfit은 삭제하지 않는다.
- 이미지 교체는 새 cutout이 ready가 된 뒤 이전 ready cutout을 비활성화한다.
- 업로드 실패는 기존 ready 이미지에 영향을 주지 않는다.

## 5. 화면 흐름

### 5.1 새 Item

진입:

- CLOSET 상단의 `새 Item`
- 이미지 없음 필터에서 `이미지 등록`

흐름:

```text
기본 정보 입력
→ 중복 가능성 확인
→ Item 저장
→ cutout 선택 또는 나중에 하기
→ 미리보기 확인
→ Item 상세
```

저장 버튼을 두 번 눌러도 Item이 중복 생성되지 않도록 클라이언트가 생성 UUID를 먼저 만들고 같은 요청의 멱등성 키로 재사용한다.

### 5.2 Item 편집과 이미지 교체

Item 상세에서 정보 편집과 이미지 관리를 분리한다.

- `정보 수정`: 이름, 카테고리, 색상, 계절, 구매일, 메모, 적합성
- `이미지 등록`: 이미지가 없는 Item
- `이미지 교체`: ready 이미지가 있는 Item
- `Retired로 전환`: 별도 확인 후 수행

이미지 교체 중에는 기존 이미지를 계속 보여 준다.

### 5.3 새 Outfit

진입:

- LOOKBOOK 상단의 `새 Outfit`
- Outfit 상세의 `이 착장으로 새로 만들기`
- Item 상세의 `이 Item으로 착장 만들기`

저장 검토에는 다음을 보여 준다.

- 선택 Item 수와 목록
- 이미지 있음·없음 수
- 같은 Item 조합의 기존 Outfit
- 이름
- 미리보기

저장 성공 뒤 새 Outfit 상세로 이동한다. Wear Log는 자동 생성하지 않는다.

## 6. 데이터와 보안

### 6.1 기존 테이블 사용

Phase 3는 기존 테이블을 우선 재사용한다.

| 테이블 | 역할 |
|---|---|
| `closet_items` | Item 기본 정보 |
| `closet_outfits` | Outfit 기본 정보 |
| `closet_outfit_items` | Outfit과 Item relation, placement |
| `closet_item_images` | cutout metadata와 상태 |
| `closet_outfit_previews` | version별 preview cache |
| `storage.objects` | private cutout·preview 객체 |

필요한 최소 schema 보강:

- `closet_items.display_hex`: 기존 palette HEX를 backfill하고 앱 생성 Item의 fallback 색상을 직접 저장
- `closet_outfits.archived_at`: 만족도 `Error`와 분리된 보관·복원 상태
- image metadata unique index: 기존 ready를 유지하면서 새 pending 교체본을 만들 수 있도록 ready 한 개만 고유하게 제한
- preview stale 상태 또는 그와 동등한 version 판정 필드

### 6.2 필요한 쓰기 계약

현재 앱 회원에게는 Item·Outfit 생성과 relation 생성 권한이 없다. Phase 3 migration은 다음을 명시적으로 추가한다.

- 회원 workspace의 Item insert·허용 필드 update
- 회원 workspace의 Outfit 이름·평가·보관 상태 update
- 새 Outfit과 relation을 한 트랜잭션으로 만드는 database function
- 기존 Outfit을 읽어 새 Outfit과 relation으로 복제하는 database function
- 완전히 같은 Item 집합을 찾는 query 또는 function
- 이미지 pending 생성·ready 전환·오류 기록 계약
- preview pending 생성·ready 전환·stale 처리 계약

`closet_outfit_items`의 Item 관계를 임의 update·delete하는 넓은 권한은 주지 않는다. 기존 위치·크기와 T-shirt 표시 방식에 필요한 `slot`·`z_index`만 column-level update 권한으로 허용하고 workspace member RLS를 유지한다.

### 6.3 트랜잭션 경계

Item 기본 정보는 단일 행 저장으로 처리한다.

Outfit 저장은 다음 전체가 한 database transaction에서 성공하거나 모두 실패해야 한다.

```text
closet_outfits insert
+ closet_outfit_items N개 insert
+ workspace·Item 소유권 검증
+ 클라이언트 생성 UUID 멱등성 확인
```

Storage 객체와 database transaction은 하나로 묶을 수 없으므로 이미지 흐름은 단계형으로 처리한다.

```text
기존 ready 유지
→ 새 metadata pending
→ 최적화 객체 업로드
→ 객체·소유권·크기 확인
→ 새 metadata ready
→ 이전 ready 비활성화
```

중간 실패 시 pending/error 상태를 보고 재시도하며, 기존 ready 이미지나 Item 행은 유지한다.

### 6.4 권한 원칙

- 비로그인 사용자는 Item·Outfit·metadata·Storage를 읽거나 쓰지 못한다.
- workspace 비회원은 UUID나 Storage 경로를 알아도 접근하지 못한다.
- 앱에 service-role key를 넣지 않는다.
- 넓은 Storage insert/update/delete 정책을 브라우저에 직접 주지 않는다.
- 이미지 업로드·finalize는 인증 회원과 Item 소유권을 확인하는 제한된 서버 계약을 사용한다.
- 원본 파일명과 로컬 경로는 metadata나 로그에 저장하지 않는다.
- 오류 로그에는 signed URL, JWT, 이미지 바이너리를 남기지 않는다.

## 7. 이미지 처리 계약

### 7.1 입력 검증

- 허용: 투명 PNG, 투명 WebP
- 차단: 0px, 완전 투명, 손상 파일, 지나친 파일 크기
- 경고: 투명 배경 없음, Item 일부 잘림 가능성, 너무 작은 입력
- 사용자가 확인할 미리보기: 원본 선택 결과와 최종 정규화 결과

### 7.2 정규화

기존 Image Spec을 그대로 사용한다.

```text
투명 경계 탐색
→ alpha trim
→ 2.5% 안전 여백
→ 종횡비 유지
→ 긴 변 최대 1600px
→ 투명 WebP
→ 700KB 상한 확인
```

작은 입력은 억지로 확대하지 않는다.

### 7.3 상태

| 상태 | 의미 | 화면 |
|---|---|---|
| 없음 | 이미지 미등록 | 스와치 fallback, 등록 버튼 |
| pending | 업로드·검증 중 | 기존 ready 또는 fallback 유지 |
| ready | 사용 가능 | cutout 표시 |
| error | 실패 | 원인과 재시도 |
| stale | 관계·version 변경 | 실시간 합성 우선, 캐시 재생성 가능 |

기존 metadata의 `pending/ready/error`를 유지하되 preview stale 표현이 필요한지는 P3-1 migration에서 확정한다.

## 8. 구현 단계

### P3-0. 구현 전 확인과 원격 preflight

작업:

- Phase 2를 완료 처리하고 실사용 추가 관찰을 비차단 항목으로 이동
- 현재 원격 migration·RLS·Storage policy·bucket 상태 읽기 전용 대조
- Item·Outfit·image 실제 수량과 고아 metadata 기준선 기록
- 앱 내 첫 업로드 입력을 투명 cutout으로 제한하는 방향 확인
- 원격 테스트 Item·Outfit을 만들지 여부와 정리 절차를 J와 확인

완료 조건:

- 변경 전 기준선과 rollback 범위를 문서화한다.
- 이미지 입력·삭제·중복 Outfit 정책의 미확정 값이 없다.
- Secret과 개인 원본 파일이 Git에 들어가지 않는다.

#### P3-0 확인 결과 - 2026-07-29

- J의 Phase 3 구현 시작 요청에 따라 기존 제품 결정을 유지한다: 첫 업로드는 투명 PNG/WebP cutout, 영구 삭제 UI 제외, 실제 검증은 Item 1개와 복제 Outfit 1개를 사용하고 Wear Log는 자동 생성하지 않는다.
- 원격 `mworkroom`을 읽기 전용으로 대조했다. 최신 Closet migration은 `20260728160018_phase2_wear_log_weather_provenance`이며, Phase 3 migration은 아직 원격에 적용하지 않았다.
- 기준선은 Item 451개, Outfit 507개, relation 2,401개, Wear Log 784개다.
- Item image metadata는 ready 56개, pending 0개, error 0개이며 Outfit preview metadata는 ready 1개다. `closet-images` 객체는 57개다.
- 고아 Item image metadata, 고아 Outfit preview metadata, 고아 Storage 객체, 객체가 누락된 ready metadata는 모두 0개다.
- 현재 image unique index는 `pending`과 `ready`를 동시에 고유 대상으로 삼아 기존 ready를 유지한 교체 흐름을 막는다. P3-1 로컬 migration에서는 ready 한 개만 고유하게 제한하도록 변경한다.
- 2026년 Supabase Data API 기본 변경에 맞춰 새 쓰기 계약은 RLS뿐 아니라 `authenticated`의 최소 column/function `GRANT`를 migration에 명시한다.
- rollback 범위는 Phase 3의 새 column, policy, grant, function, index로 제한한다. 원격 적용 전에는 로컬 migration 파일과 repository 변경만 되돌리면 되며 기존 데이터와 Storage 객체에는 영향이 없다.
- Secret, 실제 이미지 원본, signed URL, JWT는 조회·기록·Git 추가 대상에 포함하지 않았다.

### P3-1. Item·Outfit 쓰기 migration과 repository 계약

작업:

- Item 생성·편집 input type과 repository method 추가
- Outfit 생성·복제 input type과 database function 추가
- Item fallback HEX와 Outfit `archived_at` migration 추가
- 클라이언트 생성 UUID를 이용한 재시도 멱등성 추가
- workspace membership RLS·명시적 column grant 추가
- 정확히 같은 Item 조합 조회 계약 추가
- demo repository와 SQL 계약 테스트 작성

완료 조건:

- 비로그인·비회원 쓰기가 거부된다.
- 회원은 자기 workspace에만 Item·Outfit을 만들 수 있다.
- Outfit 또는 relation 일부만 남는 부분 저장이 없다.
- 기존 Outfit relation은 생성 흐름으로 수정되지 않는다.
- Outfit 보관이 `Error` 평가나 기존 Wear Log를 바꾸지 않는다.

### P3-2. Item 등록·편집 UI

작업:

- CLOSET `새 Item` 진입 추가
- 필수·선택 필드와 명시적 미지정 상태 구현
- 같은 이름·카테고리 경고
- 저장 중 중복 클릭 차단과 재시도
- Item 상세의 정보 편집·Retired 전환 연결
- 이미지 없는 새 Item의 스와치 fallback 확인

구현 상태 (2026-07-29):

- 로컬 소스에 CLOSET `새 Item` 진입, 등록·편집 공용 화면, 상세 정보 수정 진입을 구현했다.
- 이름·카테고리 필수 검증, 명시적 색상 미지정, fallback HEX, 계절 미지정, 신발 전용 장거리 조건을 연결했다.
- 같은 이름·카테고리는 기존 Item 링크와 함께 경고하고 명시적으로 확인한 경우에만 계속 저장한다.
- 화면 진입 시 생성 UUID를 한 번만 만들고 저장 중 버튼을 잠가 중복 클릭 재생성을 막는다.
- Item 상세에서 별도 확인 후 Retired로 전환하고, 기존 Outfit·Wear Log를 지우지 않은 채 다시 사용 중으로 복원할 수 있게 했다.
- demo repository와 모바일 375px 로컬 브라우저에서 등록·편집·Retired 흐름을 검증했다.
- 원격 migration이 아직 적용되지 않았으므로 Supabase 실제 저장과 공개 배포 검증은 완료 조건으로 남겨 둔다.

완료 조건:

- PC와 모바일에서 새 Item을 이미지 없이 만들고 다시 열 수 있다.
- 새 Item이 현재 계절·검색·색상 필터에 맞게 나타난다.
- 편집이 기존 Outfit relation과 Wear Log를 바꾸지 않는다.

### P3-3. 앱 내 cutout 등록·교체

작업:

- 파일 선택·미리보기·투명도 검사
- 브라우저 정규화와 WebP 최적화
- 제한된 upload/finalize 서버 계약
- pending·ready·error 전환
- 이미지 교체 중 기존 ready 유지
- signed URL 갱신과 fallback 연결

구현 상태 (2026-07-29):

- Item 상세에 투명 PNG/WebP 선택, 투명도 검사, 실제 alpha 경계 trim, 2.5% 안전 여백, WebP 최적화, 저장 전 미리보기를 구현했다.
- 원본 파일은 전송하지 않고 500KB 목표·700KB 상한을 적용한 cutout Blob만 repository에 전달한다.
- Supabase 경로는 인증 Edge Function이 회원·Item 소유권을 확인하고 service-role-only RPC로 pending metadata를 만든 뒤 signed upload ticket을 발급한다.
- 업로드 객체의 크기·MIME를 DB에서 확인한 뒤에만 새 metadata를 ready로 전환하며, 그 전까지 기존 ready 이미지를 유지한다.
- 기존 ready 전환과 새 ready 승격은 하나의 database function transaction에서 처리하고 이전 객체는 승격 뒤 정리한다.
- 취소·서명 실패·업로드 실패 경로는 pending metadata를 error로 전환하고 새 객체를 정리하도록 연결했다.
- demo repository에서는 같은 UI 흐름을 localStorage data URL로 검증할 수 있게 했다.
- 375px 로컬 브라우저에서 기존 투명 WebP를 881×1225px·13KB WebP로 다시 준비하고 미리보기·가로 넘침·콘솔 오류 부재를 확인했다.
- migration pgTAP 15개 항목과 Edge handler·repository·UI 단위 테스트를 작성했으나 Docker 부재로 실제 PostgreSQL·로컬 Edge runtime 검증은 남아 있다.

완료 조건:

- 원본은 원격에 저장하지 않고 최적화 cutout만 저장한다.
- 실패와 재시도에서 고아 객체나 중복 ready metadata가 남지 않는다.
- 새 cutout이 CLOSET·Item 상세·기존 Outfit composition에 반영된다.

### P3-4. 새 Outfit 만들기

작업:

- Item 검색·`Outer → Top → Bottom → Dress → Shoes → Bag → Acc` 상위 카테고리 그룹·색상·계절 필터
- CLOSET과 같은 공통 `category → categoryGroup` 규칙을 사용하고 상세 category는 저장·통계·composition용으로 보존
- `Socks`는 `Acc`에 포함하고 독립 `Innerwear` Item은 선택 대상에서 제외하되 Statistics 집계에는 유지
- Item 추가·제거와 중복 선택 차단
- composition v4 실시간 미리보기
- T-shirt 계열 Item별 `자동`·`아우터 안`·`옆에 분리` 표시 방식 선택
- Item별 위치·크기 조정
- 동일 Item 조합 경고
- 새 Outfit과 relation의 원자적 저장

구현 상태 (2026-07-31):

- LOOKBOOK 상단에 `새 Outfit` 진입을 추가하고 빈 화면에서 Item을 골라 착장을 구성하는 화면을 구현했다.
- 선택 요약·실시간 composition·검색·상위 카테고리·색상·계절·Retired 필터와 Item 추가·제거를 연결했다.
- 공통 category group 규칙을 재사용해 `Outer → Top → Bottom → Dress → Shoes → Bag → Acc` 순서를 유지하고, `Socks`는 `Acc`에 포함하며 독립 `Innerwear`는 선택 대상에서 제외했다.
- 이미지 유무가 섞인 Item 조합을 허용하고, 이미지가 있는 Item에는 위치·크기와 T-shirt 표시 방식을 새 Outfit의 draft relation 값으로 조정할 수 있게 했다.
- 같은 Item 조합이 있으면 기존 Outfit 링크를 먼저 표시하고 명시적으로 확인한 경우에만 별도 UUID로 저장한다.
- 기존 `create_closet_outfit` database function을 재사용해 Outfit과 모든 relation을 한 transaction으로 저장하고, 성공 결과를 Context에 즉시 반영한 뒤 새 상세로 이동한다.
- 생성 UUID는 화면 진입 때 한 번만 만들고 저장 중 버튼을 잠가 재시도와 중복 제출에 안전하게 했다. Wear Log와 평가는 자동 생성하지 않는다.
- demo 단위 테스트, PC 1200px·모바일 375px 브라우저 QA와 production build를 통과했다. production 앱 배포와 실제 Supabase 생성 검증은 P3-7 전 확인으로 남겨 둔다.

완료 조건:

- 이미지 있는 Item과 없는 Item을 함께 저장할 수 있다.
- 새 Outfit이 LOOKBOOK과 상세에 즉시 나타난다.
- 저장 실패 시 Outfit·relation이 일부만 남지 않는다.
- 기존 추천과 Wear Log 계산 결과에 회귀가 없다.

### P3-5. 기존 Outfit 복제

작업:

- Outfit 상세에 `이 착장으로 새로 만들기`
- Outfit 상세의 보관·복원 연결
- Item·placement 초기값 복사
- Item 추가·제거 뒤 새 UUID로 저장
- 기존 Outfit과 새 Outfit의 독립성 테스트

완료 조건:

- 원본 Outfit의 relation·평가·Wear Log가 변하지 않는다.
- 복제 Outfit은 별도 추천·Wear Log 통계를 갖는다.
- 같은 이름이어도 UUID로 정확한 상세가 열린다.

### P3-6. preview 생성·캐시와 관리 상태

작업:

- 브라우저 composition 결과를 900×1200 WebP로 생성
- version이 있는 preview pending·ready 전환
- relation·cutout·composition version에 따른 stale 판정
- 이미지 없음·오류·stale 필터
- 고아 metadata·Storage object 점검 도구

완료 조건:

- preview 실패가 Outfit 사용을 막지 않는다.
- 새 ready preview가 확인되기 전 기존 preview를 덮어쓰지 않는다.
- 관계가 다른 preview를 잘못 보여 주지 않는다.

### P3-7. 통합 검증과 공개 배포

자동 검증:

- Item 생성·편집·Retired
- Outfit 생성·복제·동일 조합 경고
- 원자적 relation 저장과 멱등 재시도
- 이미지 pending·ready·error·교체
- 추천·Wear Log·통계 회귀
- typecheck, 전체 Vitest, production build
- Storage/RLS/함수 계약

실제 검증:

- 실제 새 Item 1개를 이미지 없이 저장
- 같은 Item에 cutout을 나중에 등록
- 기존 Outfit 복제로 Item 하나를 바꾼 새 Outfit 저장
- 원본 Outfit이 그대로인지 확인
- 새 Outfit이 HOME·LOOKBOOK·Wear Log에서 정확히 연결되는지 확인

실제 검증은 반복 외출 횟수를 완료 조건으로 사용하지 않는다. 한 번의 통제된 생성·복제·표시 경로와 자동 경계 테스트로 Phase 3 구현을 판정하고, 이후 사용성은 비차단 관찰로 남긴다.

배포 검증:

- 공개 Pages의 새 Item·Outfit 경로
- 비로그인·비회원 쓰기 거부
- Storage에 원본·Secret·로컬 경로 없음
- 고아 metadata와 고아 object 0개
- 실제 기준 Item·Outfit·Wear Log 수량이 설명 가능함

## 9. 테스트 기준

| 조건 | 기대 결과 |
|---|---|
| 이미지 없이 Item 저장 | 저장 성공, 스와치 fallback |
| 같은 이름 Item 존재 | 경고 후 명시적 저장 가능 |
| cutout 업로드 실패 | Item 유지, 기존 이미지 또는 fallback |
| cutout 교체 성공 | 새 ready 확인 뒤 기존 이미지 비활성화 |
| Outfit 저장 중 relation 오류 | 전체 rollback |
| 저장 버튼 중복 클릭 | Outfit 한 개만 생성 |
| 같은 Item 조합 존재 | 기존 Outfit 안내와 확인 |
| 기존 Outfit에서 Item 변경 | 원본 수정 없이 새 Outfit 생성 |
| Outfit 보관 | 추천·기본 목록 제외, Wear Log 유지, 복원 가능 |
| 일부 Item만 이미지 있음 | 가능한 이미지 composition과 relation 전체 유지 |
| preview 생성 실패 | 실시간 composition 또는 fallback |
| Retired Item 포함 | 명시적으로 포함한 경우만 새 Outfit 선택 가능 |
| 다른 workspace Item UUID | 생성 거부 |
| 비로그인 업로드 | 거부 |
| 기존 Wear Log가 있는 원본 Outfit | 복제 뒤에도 원본 통계 유지 |

## 10. 위험과 대응

| 위험 | 대응 |
|---|---|
| 새 쓰기 권한이 기존 읽기 전용 테이블을 넓게 개방 | 좁은 column grant와 workspace RLS, 다중 행은 database function |
| Outfit 일부 relation만 저장 | 한 transaction의 create/clone function |
| 이중 클릭으로 중복 생성 | 클라이언트 생성 UUID 멱등성, 저장 중 버튼 잠금 |
| 이미지 실패로 Item까지 잃음 | Item 저장과 이미지 업로드 단계 분리 |
| 교체 실패로 정상 이미지가 사라짐 | 새 ready 확인 전 기존 ready 유지 |
| 브라우저 메모리 부족 | 입력 크기 상한, 단계적 축소, 작은 preview |
| iPhone에서 형식 decode 실패 | 지원 형식 안내, 이미지 없이 저장, 외부 누끼 준비 fallback |
| 기존 Outfit을 실수로 변경 | relation 변경 UI 금지, 복제 전용 경로 |
| 동일 조합 Outfit이 과도하게 늘어남 | UUID 집합 비교와 저장 전 경고 |
| 이미지 작업이 추천 로직을 바꿈 | 이미지 계층 분리와 추천·Wear Log 전체 회귀 |
| 전체 451개 이미지 완성이 범위를 막음 | 새 Item과 필요 Item 중심의 점진적 등록 |

## 11. 완료 정의

Phase 3는 다음 조건을 만족하면 완료로 본다.

- [ ] 회원이 새 Item을 이미지 없이 등록하고 편집할 수 있다.
- [ ] Item cutout을 앱에서 등록·교체·재시도할 수 있다.
- [ ] 고해상도 원본은 기본 원격 저장되지 않는다.
- [ ] 회원이 빈 화면과 기존 Outfit 복제로 새 Outfit을 만들 수 있다.
- [ ] 기존 Outfit의 Item relation과 Wear Log는 복제 과정에서 변하지 않는다.
- [ ] 같은 Item 조합의 기존 Outfit을 저장 전에 확인할 수 있다.
- [ ] 새 Outfit과 relation은 원자적으로 저장되고 중복 제출에 안전하다.
- [ ] Outfit 보관·복원이 만족도와 기존 Wear Log를 바꾸지 않는다.
- [ ] 새 Item·Outfit이 기존 추천·LOOKBOOK·Wear Log에 연결된다.
- [ ] 이미지 없음·일부 있음·오류 상태에서 fallback이 유지된다.
- [ ] 비로그인·비회원 쓰기와 Storage 접근이 거부된다.
- [ ] 고아 metadata와 고아 Storage object가 없다.
- [ ] 전체 자동 테스트, production build, 원격 계약, 공개 Pages 검증이 통과한다.

## 12. P3-0에서 J와 확인할 값

구현 시작 전 다음 세 가지만 확인한다.

1. 첫 앱 내 이미지 등록은 `이미 투명 배경인 PNG/WebP cutout` 업로드로 시작한다.
2. 잘못 만든 Item·Outfit의 영구 삭제는 Phase 3 첫 범위에 넣지 않고 Retired·추천 제외로 처리한다.
3. 원격 검증에서는 J가 실제로 추가할 Item 1개와 복제 Outfit 1개를 사용하며, 가짜 Wear Log는 만들지 않는다.

이 값이 승인되면 P3-1 원격 schema preflight부터 시작한다. 승인 전에는 DB·Storage·Edge Function·배포를 변경하지 않는다.
