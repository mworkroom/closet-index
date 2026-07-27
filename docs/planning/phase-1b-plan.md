# Closet Index Phase 1B Implementation Plan

- 작성일: 2026-07-27
- 상태: B1~B6 공개 배포 완료, composition v2 실시간 목록 thumbnail 로컬 구현과 Batch 2 cutout 업로드 완료, 새 코드의 공개 배포·iPhone PWA 실사용 대기
- 목표 릴리스: Visual MVP / v1.0
- 선행 상태: Phase 1A Technical Alpha와 원격 Wear Log CRUD 검증 완료
- 관련 문서: [Phase 1 MVP Spec](./phase-1-mvp-spec.md), [Roadmap](./roadmap.md), [Data & Security](./phase-1-data-security-spec.md), [Acceptance Checklist](./phase-1-acceptance-checklist.md), [Pilot Outfits](./phase-1b-pilot-outfits.md), [Image Spec](./phase-1b-image-spec.md)

## 1. 목표

Phase 1B의 목적은 데이터와 계산이 맞는 Phase 1A를 실제 옷 이미지를 빠르게 훑어보고 고를 수 있는 Visual MVP로 확장하는 것이다.

핵심 결과는 다음과 같다.

- 현재 계절과 자주 사용하는 온도대를 대표하는 Outfit 20~30개에 시각적 미리보기를 제공한다.
- HOME 추천 후보를 이미지로 비교하고 기존 추천 근거·경고를 그대로 이해할 수 있다.
- CLOSET, LOOKBOOK, FAVORITE, 상세 화면, Calendar가 이미지 유무와 관계없이 안정적으로 작동한다.
- 추천 → Outfit 상세 → 오늘 입기 → Calendar·Statistics 반영 흐름을 iPhone에서 반복 사용할 수 있다.
- Visual MVP 검증 후 Supabase를 유일한 쓰기 원본으로 전환하고 v1.0을 선언할 수 있다.

## 2. 기준선

Phase 1B는 Phase 1A를 다시 설계하지 않는다.

- 화면 12개와 5개 하단 탭을 유지한다.
- 추천, 최근 구매, 시험 착장, 비슷한 과거 착장 계산을 변경하지 않는다.
- 이미지가 추천 자격이나 순위를 결정하지 않는다.
- 이미지가 없거나 로드에 실패해도 현재의 텍스트·HEX 스와치 fallback을 유지한다.
- Item·Outfit 생성 및 일반 편집, 앱 안의 이미지 업로드·누끼 편집은 포함하지 않는다.
- 자유 배치 캔버스, AI 배경 제거, AI 착장 생성은 포함하지 않는다.
- composition v2 프로토타입은 J의 3개 기준 시안에서 도출한 공통 아이템 템플릿·카테고리 배율·조건부 레이어를 사용하며, v1 원격 preview를 덮어쓰지 않는다.
- 개인 원본 이미지, 누끼 작업 파일, 생성된 미리보기는 Git에 커밋하지 않는다.

현재 원격 기준 데이터는 Item 451개, Outfit 507개, Wear Log 783개다. Phase 1B는 전체 항목의 이미지화를 기다리지 않고 대표 Outfit 20~30개로 시작한다.

## 3. 권장 이미지 구조

J의 결정에 따라 private Storage와 새로 준비한 누끼 이미지를 사용한다. 과거 iPhone 앱의 내부 이미지 파일을 추출하거나 복구하는 작업은 하지 않는다.

### 3.1 Storage

- bucket 권장 이름: `closet-images`
- 공개 범위: private
- 앱 읽기: 로그인 및 workspace membership 확인 후 signed URL 사용
- 쓰기: 앱이 아니라 로컬 준비·업로드 도구가 Secret key로 수행
- 사용자 앱에는 업로드·삭제 권한을 부여하지 않음

경로 규칙:

```text
00000000-0000-0000-0000-000000000003/
  items/{item_id}/original/{asset_id}.{ext}
  items/{item_id}/cutout/{asset_id}.webp
  outfits/{outfit_id}/preview/v{composition_version}.webp
```

고해상도 원본은 기본 Storage 경로를 만들지 않고 로컬 준비 단계에서만 사용한다. 명시적으로 장기 보관할 예외가 생길 때만 기존 `original` variant와 경로 계약을 사용한다.

### 3.2 파일 권장안

J가 직접 캔버스 중심과 Item 크기를 맞추지 않는다. 상세한 입력·자동 정규화 규칙은 [Image Spec](./phase-1b-image-spec.md)을 따른다.

| 종류 | 권장 형식 | 권장 크기 | 용도 |
|---|---|---|---|
| 입력 원본 | JPEG, PNG, HEIC 입력 허용 | 해상도 강제 없음, 가능하면 긴 변 1200px 이상 | 누끼 검증·재가공 중 로컬 임시 보관, 기본 원격 업로드 안 함 |
| Item 누끼 | 투명 WebP | 긴 변 1200~1600px | Item 상세·합성 |
| Outfit preview | 투명 WebP | 900 × 1200px, 3:4 | 내보내기·저장 fallback·합성 버전 보존 |
| 목록 thumbnail | ready cutout이 모두 있으면 composition v2 실시간 합성, 아니면 저장 preview 또는 스와치 fallback | 3:4 | HOME·LOOKBOOK·FAVORITE |

초기 품질 목표:

- 고해상도보다 iPhone 화면에서 Item 종류·색·형태를 알아볼 수 있는지를 우선
- iPhone 촬영본, 과거 앱 캡처, 쇼핑몰 이미지를 구분하지 않고 같은 입력으로 허용
- 긴 변 500~1200px 캡처 이미지도 인지 가능하면 허용하고 강제 확대하지 않음
- Item 누끼는 보통 50~500KB, 700KB 초과 시 경고
- Outfit preview 1개당 350KB 이하
- EXIF 위치·촬영 정보 제거
- 잘못된 MIME type, 0px 크기, 투명 영역만 있는 파일은 업로드 차단

Batch 0 누끼 7개는 서로 다른 출처와 해상도가 섞여 있었지만 모두 인지 가능성과 합성 품질을 통과했다. 앱 표시용 누끼 평균은 약 164KB, 첫 Outfit preview는 약 132KB였다. 현재 Item 451개와 Outfit 507개 전체에 이 평균을 단순 적용한 예상 Storage는 약 141MB다.

고해상도 원본은 앱 운영에 필요하지 않으므로 Supabase에 기본 보관하지 않는다. 정책 변경 전에 업로드된 Batch 0 original PNG 7개 약 12.78MB는 준비·업로드 도구와 metadata 계약을 먼저 정리하고 cutout·preview 읽기를 검증한 뒤 별도 정리 단계에서 처리한다. J는 pilot 후보의 누끼를 새로 만들며, legacy iPhone 앱의 저장 구조를 조사하는 작업은 Phase 1B 범위에서 제외한다.

### 3.3 메타데이터

기존 테이블을 사용한다.

- `closet_item_images`: Item별 선택적 `original`, 운영용 `cutout` 경로와 처리 상태
- `closet_outfit_previews`: Outfit별 합성 이미지 경로, 합성 버전, 처리 상태

추가 migration에서 다음 계약을 보강한다.

- Item 하나에 활성 `cutout` 1개, 명시적으로 보관할 때만 활성 `original` 최대 1개
- Outfit 하나와 composition version 하나에 preview 1개
- `ready`인 이미지 중 앱이 선택할 행의 결정 규칙
- Storage object 경로와 metadata 행의 workspace·소유 대상 일치
- 앱 사용자는 metadata와 객체 읽기만 가능

## 4. 고정 슬롯 합성 원칙

로컬 도구는 재실행 가능한 900×1200 preview를 생성·보존한다. 앱 목록과 상세는 Outfit의 모든 Item에 ready cutout이 있으면 같은 composition v2 규칙과 저장된 `position_x`·`position_y`를 브라우저에서 합성해, 위치 보정이 구형 저장 preview보다 먼저 반영되게 한다. cutout이 하나라도 없으면 저장 preview를 사용하고, 그것도 없거나 로드에 실패하면 기존 스와치 fallback을 유지한다.

J가 과거 앱에서 반복 사용한 배열을 기본 슬롯으로 확정한다. 이 구조는 자유 배치가 아니라 정해진 좌표와 레이어를 사용하는 결정적 합성이다.

| 배치 | 대표 카테고리 | 위치·레이어 |
|---|---|---|
| main-neck | `Acc-Neck`, `Acc-Neck-made` | 왼쪽 주열 맨 위 |
| main-outer | Outer 계열 | 왼쪽 주열 상단 |
| main-bottom | Pants·Skirt·Dress 계열 | 왼쪽 주열 중앙·하단 |
| main-socks | `Socks` | 왼쪽 주열 하단, 전체 중 가장 낮은 z-index |
| main-shoes | `Shoes` | 왼쪽 주열 맨 아래, 양말보다 앞 |
| side-top | Top 계열 | 오른쪽 상단. 아우터에 가려질 이너 상의를 따로 보여줌 |
| side-bag | Bags 계열 | 오른쪽 하단 |

규칙:

- 카테고리 문자열을 그대로 좌표로 사용하지 않고 `category → visual slot` 매핑표를 둔다.
- 아우터가 있으면 Top 계열은 `side-top`에 놓아 가려지지 않게 한다.
- 아우터가 없으면 Top 계열은 왼쪽 주열의 상단을 사용하고 가방만 오른쪽에 둔다.
- Dress가 있으면 Dress가 `main-bottom`의 넓은 영역을 사용한다.
- 양말은 Outfit에 있을 때 표시하되 가장 낮은 z-index를 사용한다.
- 목 액세서리는 아우터보다 위쪽에 놓고 아우터와 함께 보이도록 한다.
- 같은 슬롯의 Item이 여러 개이면 임의로 겹치지 않고 명시적 우선순위 또는 별도 예외 규칙을 사용한다.
- 필요한 핵심 누끼가 부족하거나 매핑할 수 없는 조합은 억지로 합성하지 않고 fallback 카드로 남긴다.
- 슬롯 좌표와 크기는 코드에 흩어 놓지 않고 version이 있는 한 설정 파일에서 관리한다.
- 기존 `closet_outfit_items.slot`, `position_x`, `position_y`, `scale`, `z_index`는 카테고리 기본값으로 해결되지 않는 Outfit만 보정하는 override로 사용한다.

구현 전에 아래 세 종류의 대표 Outfit으로 시각 규칙을 검증한다.

1. 상의 + 하의 + 신발 + 가방
2. 아우터 + 상의 + 하의 + 신발 + 가방
3. 원피스 또는 손뜨개 액세서리를 포함한 예외 조합

## 5. 작업 단계

### B0. 대표 범위와 시각 계약 확정

작업:

- 제가 실제 Supabase 데이터에서 현재 계절, 최근 구매·착용, Favorite, 착용 근거를 기준으로 대표 Outfit 24개를 고른다.
- 선택된 Outfit의 Item relation과 이미지 준비 상태를 점검한다.
- 3~5개 Outfit으로 슬롯·크기·겹침 시안을 비교한다.
- 이미지 규격, 배경, 여백, 슬롯 좌표를 `phase-1b-image-spec.md`로 확정한다.

완료 기준:

- [Pilot Outfits](./phase-1b-pilot-outfits.md)의 Outfit UUID 24개가 고정된다.
- 필요한 Item과 누끼 준비 여부를 추적할 manifest가 있다.
- 일반 조합과 예외 조합 모두에서 카드가 알아볼 수 있게 표시된다.

### B1. Storage·보안 계약 구현

작업:

- private `closet-images` bucket migration을 추가한다.
- workspace 경로만 읽을 수 있는 `storage.objects` 정책을 추가한다.
- metadata 테이블의 활성 이미지 선택 규칙과 고유 제약을 보강한다.
- signed URL 생성과 만료 후 갱신 방식을 정한다.
- Storage·metadata 계약을 pgTAP 또는 SQL 계약 테스트에 추가한다.

완료 기준:

- 비로그인 사용자는 객체와 metadata를 읽지 못한다.
- workspace 비회원은 경로를 알아도 객체를 읽지 못한다.
- Closet Index 회원은 자기 workspace의 ready 이미지만 읽을 수 있다.
- 프런트엔드에 Secret key나 넓은 Storage 쓰기 권한이 없다.

### B2. 이미지 준비·업로드 도구 구현

작업:

- Git에서 제외되는 로컬 asset 폴더와 manifest 형식을 정한다.
- manifest는 최소한 `item_id`, 원본 경로, 누끼 경로, 상태를 가진다.
- 이미지 검증·리사이즈·WebP 최적화 스크립트를 만든다.
- 고해상도 원본은 로컬 준비에만 사용하고 기본 업로드 계획에서는 제외한다.
- `dry-run → 명시적 apply → 결과 보고서` 순서로 동작하는 멱등 업로드 도구를 만든다.
- Storage 업로드와 `closet_item_images` metadata 입력을 한 작업으로 추적한다.

완료 기준:

- 같은 manifest를 다시 실행해도 중복 행이나 고아 객체가 생기지 않는다.
- 실패한 Item과 원인을 보고서에서 찾을 수 있다.
- 개인 이미지와 manifest의 로컬 경로가 Git 상태에 나타나지 않는다.
- 대표 Item의 cutout이 Supabase에서 정확한 Item UUID에 연결되며, original은 명시적 예외일 때만 연결된다.

### B3. Outfit preview 합성 도구 구현

작업:

- version이 있는 슬롯 설정과 카테고리 매핑을 만든다.
- Item 누끼를 결정적으로 합성하는 로컬 스크립트를 만든다.
- preview 생성·최적화·업로드와 `closet_outfit_previews` 입력을 연결한다.
- 누락 이미지, 알 수 없는 카테고리, 같은 슬롯 충돌을 보고한다.
- composition version이 바뀌면 이전 preview를 보존하면서 새 버전을 만들 수 있게 한다.

완료 기준:

- 같은 입력과 같은 composition version은 같은 배치 결과를 만든다.
- pilot Outfit 20~30개 중 합성 가능·fallback·수정 필요 상태를 구분할 수 있다.
- relation이 바뀌거나 누끼가 교체되면 필요한 preview만 재생성할 수 있다.
- 실패한 합성이 기존 ready preview를 덮어쓰지 않는다.

### B4. 앱 데이터 계층 연결

구현 상태: 2026-07-27 완료

작업:

- 앱 타입에 Item image와 Outfit preview metadata를 추가한다.
- Supabase repository가 ready metadata를 읽고 signed URL을 묶어서 생성한다.
- 데모 데이터에 이미지 있음·없음·오류 fixture를 추가한다.
- URL 만료, 객체 없음, 이미지 로드 실패 시 fallback으로 되돌린다.
- 같은 경로의 URL을 화면마다 중복 요청하지 않도록 캐시한다.

완료 기준:

- 이미지 metadata query 실패가 Item·Outfit·Wear Log 로딩 전체를 막지 않는다.
- 이미지가 없는 451개 Item과 507개 Outfit을 계속 열 수 있다.
- signed URL에 Secret key나 내부 로컬 경로가 노출되지 않는다.

### B5. 화면별 Visual MVP 적용

구현 상태: 2026-07-27 완료

| 화면 | 구현 |
|---|---|
| HOME | 추천·최근 구매·시험 착장 카드에 preview를 추가하되 근거와 경고를 유지 |
| CLOSET | cutout이 있으면 이미지 카드, 없으면 기존 스와치·텍스트 fallback |
| Item 상세 | 큰 누끼 이미지와 기존 속성·이력을 함께 표시 |
| LOOKBOOK | 모바일 3열 preview 그리드와 fallback 카드 혼합 |
| FAVORITE | LOOKBOOK과 같은 카드 컴포넌트 재사용 |
| Outfit 상세 | preview hero와 구성 Item thumbnail 표시 |
| Calendar | preview가 있는 Outfit만 작은 thumbnail 표시 |

공통 규칙:

- 이미지에는 Item명 또는 Outfit 구성으로 만든 대체 텍스트를 제공한다.
- `loading="lazy"`와 안정적인 aspect ratio로 목록의 레이아웃 이동을 줄인다.
- 이미지 로드 실패는 깨진 아이콘 대신 기존 fallback으로 전환한다.
- 클릭 영역, 상세 이동, 오늘 입기 버튼의 순서를 Phase 1A와 동일하게 유지한다.
- 이미지가 화려해져도 배경, 버튼, 하단 탭 등 UI chrome은 무채색을 유지한다.

완료 기준:

- 이미지 있음·없음·오류 카드가 같은 목록에서 높이와 이동 동작을 유지한다.
- iPhone 폭에서 LOOKBOOK 3열이 가로 스크롤 없이 표시된다.
- 추천 근거와 경고가 이미지 때문에 잘리거나 우선순위를 잃지 않는다.

### B6. 통합 검증과 배포

2026-07-27 검증 상태:

- 완료: 전체 자동 회귀, Phase 1B Storage/RLS 14개 계약, 비로그인·비회원 거부, Batch 0 수량·고아 객체 대조, 실제 회원 세션의 preview·cutout signed URL 표시, Pages base·PWA·SPA fallback 산출물과 로컬 HTTP 응답
- 대기: iPhone Safari·홈 화면 PWA 5회 실사용, J의 명시적 배포 요청 후 공개 GitHub Pages 확인
- 원격 검증 중 새 record나 object를 만들지 않았으며 커밋·푸시·배포도 실행하지 않았다.

자동 검증:

- 이미지 선택, URL fallback, 카테고리 슬롯, 합성 manifest의 단위 테스트
- repository와 화면의 이미지 있음·없음·오류 통합 테스트
- 기존 추천·Wear Log 회귀 테스트
- typecheck와 production build
- Storage RLS·metadata 제약 SQL 테스트

원격 검증:

- private 객체의 비로그인·비회원 거부
- 회원 signed URL 읽기
- pilot 이미지와 metadata 수량 대조
- 고아 metadata와 고아 Storage object 0개
- GitHub Pages 배포 HTML·asset·라우팅 확인

모바일 실사용:

- HOME에서 서로 다른 이미지 후보 비교
- 이미지 카드에서 정확한 Outfit 상세 열기
- 오늘 입기 저장 후 Calendar thumbnail과 Statistics 반영
- 비행기 모드 전환, 느린 네트워크, 만료 URL, 일부 객체 누락 후 fallback 확인
- 홈 화면 PWA와 iPhone Safari에서 하단 탭·스크롤·터치 확인

완료 기준:

- 콘솔 오류 없이 핵심 흐름을 최소 5회 반복한다.
- 핵심 흐름을 막는 이미지·레이아웃·권한 문제가 없다.
- 테스트 record와 테스트 object를 제거한 뒤 원격 수량이 기준선으로 복구된다.

### B7. 원본 전환과 v1.0 선언

Phase 1B 시각 검증이 끝난 뒤에만 진행한다.

```text
Notion 추가 입력 중단
→ 전환 직전 추가분 수동 이전
→ Item·Outfit·Wear Log·relation 최종 대조
→ Supabase 원본 전환 시점 선언
→ Notion 읽기 전용 보관
→ v1.0 태그와 운영 체크
```

완료 기준:

- 쓰기 원본이 Supabase 하나로 명확하다.
- Notion과 Supabase 최종 차이를 설명하거나 0건으로 맞춘다.
- 공개 앱의 로그인, 추천, 이미지, Wear Log CRUD를 다시 확인한다.
- rollback이 필요할 때 사용할 마지막 Notion snapshot과 import report를 보관한다.

## 6. 테스트 조합

| 조건 | 기대 결과 |
|---|---|
| 모든 Item 누끼와 preview 있음 | 이미지 카드와 상세 hero 표시 |
| 일부 Item 누끼만 있음 | 가능한 구성만 표시하거나 Outfit fallback 사용 |
| preview metadata 없음 | 기존 스와치·텍스트 카드 |
| metadata는 ready지만 객체 없음 | 로드 실패 후 fallback, 데이터 화면은 유지 |
| signed URL 만료 | URL 갱신 또는 fallback, 로그인 상태는 유지 |
| Error Outfit·Retired Item 포함 | 기존 필터 규칙 유지 |
| Wear Log 0회 Outfit | 이미지가 있어도 시험 착장 상태 유지 |
| 최근 구매 Outfit | 이미지가 있어도 온도 적합성 규칙 유지 |
| 같은 날짜·같은 Outfit 여러 기록 | preview가 같아도 독립 Wear Log 유지 |

## 7. 위험과 대응

| 위험 | 대응 |
|---|---|
| 451개 전체 이미지 작업으로 범위 확대 | 대표 Outfit 20~30개와 필요한 Item만 pilot로 고정 |
| 개인 이미지가 Git에 포함 | 전용 local-only 폴더와 `.gitignore`, push 전 Git 상태 분리 확인 |
| Storage URL 만료로 흰 카드 발생 | 중앙 URL resolver, 만료 갱신, 항상 fallback 제공 |
| 카테고리 조합이 슬롯 규칙에 맞지 않음 | 사전 category audit, 예외 manifest, 합성하지 않는 fallback 허용 |
| 큰 이미지로 모바일 로딩 저하 | WebP 최적화, lazy loading, 고정 aspect ratio, pilot 성능 측정 |
| 고해상도 원본 누적으로 Free Storage 소진 | 원본은 기본 업로드하지 않고 cutout·preview만 원격 보관 |
| 합성 실패가 정상 preview를 덮어씀 | pending 생성 후 검증 성공 시에만 ready 전환 |
| 이미지 작업 중 추천 로직 회귀 | 이미지 계층을 계산과 분리하고 기존 30개 이상 회귀 테스트 유지 |
| 원본 전환 시 Notion 추가분 누락 | 짧은 쓰기 중단, delta 수동 이전, 최종 수량·relation 대조 |

## 8. Phase 1B 완료 정의

- [x] pilot Outfit 20~30개와 필요한 Item 목록 확정
- [x] 이미지 규격·슬롯·composition version 확정
- [x] private Storage와 member read 정책 검증
- [x] 로컬 이미지 준비·업로드 도구의 dry-run·apply 검증
- [ ] pilot Item 누끼와 Outfit preview 업로드 완료
- [x] Batch 0 Item original·cutout 14개와 Outfit preview v1 업로드·재실행 검증
- [x] 준비·업로드 도구에서 고해상도 original 기본 업로드 제거
- [x] Item cutout 500KB·Outfit preview 350KB 목표의 적응형 WebP 인코딩과 초과 차단
- [x] J 전달명 Batch 2의 Item cutout 12개 업로드와 18개 Outfit 실시간 합성 thumbnail 검증
- [ ] Batch 0 original 7개는 새 정책 검증 후 안전하게 정리할지 결정
- [x] B4 ready metadata 조회·signed URL 캐시·만료/오류 fallback 계약 검증
- [x] HOME·CLOSET·LOOKBOOK·FAVORITE·상세·Calendar 이미지 적용
- [x] 이미지 없음·오류·URL 만료 fallback 검증
- [x] 추천·착용 기록·통계 자동 회귀 없음
- [x] B6 원격 Storage/RLS·수량·고아 객체와 Pages 배포 전 산출물 계약 검증
- [x] 실제 회원 브라우저 세션에서 Batch 0 signed URL 이미지 표시
- [ ] iPhone Safari와 홈 화면 PWA 핵심 흐름 5회 이상 실사용
- [ ] 공개 GitHub Pages와 원격 Supabase 통합 검증
- [ ] 최종 Notion 추가분 이전과 원본 대조
- [ ] Supabase 원본 전환 및 v1.0 선언

## 9. 확정된 구현 입력

1. pilot Outfit은 제가 Supabase 데이터에서 24개를 선정한다.
2. legacy iPhone 앱의 이미지 저장 구조는 조사하지 않는다.
3. J가 pilot Item의 누끼 이미지를 새로 만든다.
4. private Storage와 signed URL을 사용한다.
5. 합성은 J가 반복해 온 왼쪽 주열과 오른쪽 보조열의 고정 배열을 사용한다.
6. 이미지의 합격 기준은 고해상도가 아니라 iPhone 화면에서 Item을 알아볼 수 있는지다.
7. iPhone 촬영본, 과거 앱 캡처, 쇼핑몰 이미지가 섞여도 같은 정규화 과정으로 사용한다.
8. Supabase에는 Item cutout과 Outfit preview만 기본 보관하고 고해상도 원본은 올리지 않는다.

다음 구현 단위에서는 Batch 2의 18개 실시간 합성 thumbnail을 iPhone Safari·홈 화면 PWA에서 확인하고, 필요한 Outfit별 `position_x`·`position_y`를 조정한다. 공개 GitHub Pages 통합은 J의 커밋·푸시 요청 이후 검증한다. 이미지가 없거나 URL 로드가 실패하는 기존 항목은 현재 텍스트·스와치 fallback을 계속 유지한다.
