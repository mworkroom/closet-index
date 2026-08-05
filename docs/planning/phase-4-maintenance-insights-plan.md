# Closet Index Phase 4 Statistics & Replacement Lineage Plan

- 최초 작성일: 2026-08-01
- 최종 수정일: 2026-08-05
- 상태: P4-0·P4-1A·P4-1B·P4-2A·P4-2B 완료, production Legacy Link 검토 49/49·45개 directed edge 확정·P4-2C 색상 인덱스·세대별 Lineage UI·edge 설명 편집·Line 이동·Line 병합·보관·대표 Line production 적용 및 검증 완료
- 목표 릴리스: Phase 4 Statistics & Replacement Lineage
- 선행 상태: Phase 3 구현·검증·공개 완료, Phase 3.5 로컬 구현·검증 완료 및 공개 배포 전
- 관련 문서: [Roadmap](./roadmap.md), [Product Plan](./product-plan.md), [Phase 3 Plan](./phase-3-visual-wardrobe-plan.md), [Phase 1 Data & Security Spec](./phase-1-data-security-spec.md), [P4-0 Baseline Audit](./phase-4-p4-0-baseline-audit.md)

## 1. 목표

Phase 4의 목표는 Wear Log와 기존 Replacement Line 데이터를 다음 두 질문에 답할 수 있는 제품 기능으로 바꾸는 것이다.

1. 현재 보유한 각 Item을 실제로 얼마나, 어느 달에 활용했는가?
2. 같은 역할을 맡은 Item이 무엇에서 무엇으로 이어졌으며, 어느 가지가 살아남았는가?

```text
Wear Log
→ Item 활용률·착용 횟수·실제 착용 월 계산
→ 통계에서 실제 Item 목록과 상세로 이동

Notion Replacement Line·Replaces
→ 기존 Line과 무방향 연결 확인
→ 사람이 방향·시작점·가지·선택 이유 검토
→ 확인된 Replacement Lineage 저장·탐색
```

Phase 4는 숫자가 많은 범용 대시보드를 만드는 단계가 아니다. Item 관리와 대체품 판단에 실제로 쓰이는 통계, 그리고 J가 취향과 생필품 재고의 변화를 이해할 수 있는 계보에 집중한다.

## 2. Phase 경계

이번 개정에서 다음 경계를 확정한다.

| Phase | 범위 | Phase 4와의 관계 |
|---|---|---|
| Phase 4 | 각종 Item 통계와 Replacement Line | 이번 문서의 구현 범위 |
| Phase 5 | 추천 알고리즘 | 장소·교통수단·HVAC·Item 체감은 추천 근거로 사용 |
| Phase 6 | 세탁·교체·재구매 주기 | 세탁 원본 사건, 속옷 교체, 기본 Item 재구매, 세일 레이더 |

다음 기능은 Phase 4 완료 조건에 포함하지 않는다.

- 장소·교통수단 자체의 독립 통계
- 전체 Outfit 순위와 별도의 Outfit 통계 대시보드
- 장소 Profile, 실제 HVAC 관측, Item 체감 학습
- 세탁 기록, 세탁 알림, 구매주기·재구매 알림
- 임의의 장기 미착용·최근 반복 임계값

Favorite는 More에서 관리하고, Item과 연결된 Outfit은 Item 상세의 기존 흐름으로 확인한다. 장소와 교통수단은 통계 카드가 아니라 Phase 5 추천 근거로 사용한다.

## 3. 현재 기준선

### 3.1 공통 제품 원칙

- Supabase가 현재 쓰기 원본이며 Notion은 읽기 전용 보관본이다.
- Item, Outfit, Outfit relation, Wear Log는 UUID로 연결된다.
- 기존 Outfit의 Item 구성은 바꾸지 않는다. Item이 하나라도 달라지면 복제하거나 새 Outfit으로 저장한다.
- 저장 Outfit Preview cache는 제품에서 제거한다. Outfit 화면은 현재 `outfit_items + item_images`를 즉시 합성하고, cutout이 없을 때 색상 swatch를 사용한다.
- 고해상도 원본 이미지를 원격에 장기 보관하지 않고 작은 화면에서 Item을 알아볼 수 있는 품질을 우선한다.

### 3.2 Item Statistics 원본

- 2026-08-03 production과 Notion Wardrobe에는 각각 451개 Item이 있다.
- production Outfit은 508개이며 Notion 연동 505개와 앱 생성 3개로 구성된다. 읽기 전용 Notion 보관본은 507개다.
- production Wear Log는 783개이며 Notion 연동 782개와 앱 생성 1개로 구성된다. Notion 보관본도 총 783개지만 production에 없는 레거시 Log 1개가 있어 출처 구성은 다르다.
- `Acquired Date`는 구매 Item의 구매일과 직접 만든 Item의 완성일을 합친 기존 원본 값이다.
- 451개 중 442개에는 취득일이 있고 9개에는 취득일이 없다.
- Wear Log가 Item을 직접 저장하는 대신 고정 Outfit을 가리키므로, Item 착용은 Wear Log의 Outfit 구성으로 계산한다.
- 같은 날짜에 같은 Outfit을 여러 번 기록한 Wear Log는 각각 유효한 착용 기록이다.

### 3.3 Replacement Line 원본

현재 확인된 기준선은 다음과 같다.

- Replacement Line: 53개
- Line membership: 165개
- Line에 속한 고유 Item: 163개
- 복수 Line에 속한 Item: 2개
- 빈 Line: 1개
- 단일 Item Line: 10개
- 복수 Item Line: 42개
- 한 Line의 최대 Item 수: 10개
- `Replaces` 값이 있는 Item: 81개
- `Replaces` relation entry: 98개
- 실제 고유 연결: 49개 무방향 pair
- 자기 자신을 연결한 관계: 0개

98개 entry는 98개의 방향 있는 edge가 아니다. Notion self-relation 하나가 양쪽 Item에 대칭으로 표시된 결과이므로, 49개의 무방향 Legacy Link로 해석한다.

```text
Notion 표시
A의 Replaces: B
B의 Replaces: A

실제 원본 의미
A — B  1개 무방향 연결
```

연결을 2개 가진 Item도 다중 parent라고 단정할 수 없다. `A — B — C` 연쇄에서 가운데 B의 연결 수가 2일 수 있다. 현재 Legacy Link만으로는 가지, 합류, 복수 자식이 존재한다고 확정할 수 없다.

49개 pair는 연결된 두 Item이 적어도 하나의 Replacement Line을 공유한다. 기존 이주 설정은 Line의 `Name`, `Items`, `Style Identity`를 보존했지만 `Replaces` 자체는 아직 앱 데이터로 추출하지 않았다.

## 4. 제품 결정

### 4.1 Item 중심 통계

Statistics는 다음 질문에 집중한다.

- 현재 보유 Item 가운데 선택 기간에 실제로 사용한 비율은 얼마인가?
- 가장 많이 입은 Item은 무엇인가?
- 한 번도 입지 않은 Item은 무엇인가?
- 현재 보유 Item 가운데 선택 연도에 입지 않은 것은 무엇인가?
- 이 Item을 실제로 주로 입은 달은 언제인가?
- 어떤 Item은 1월부터 12월까지 연중 쓰이는가?

각 숫자는 가능하면 실제 Closet 목록 또는 Item 상세로 연결한다. 목록 미리보기는 최대 4개를 기본으로 하고, 나머지는 `더 보기`에서 확인한다.

### 4.2 카테고리 의미

착용 통계의 대상 카테고리는 다음 규칙으로 계산한다.

```text
Outer / Top / Bottom / Dress / Shoes / Bag 그룹
OR category가 "-made"로 끝남
→ Item ID로 중복 제거
```

- 독립 `Innerwear`는 말 그대로 속옷이며 Outfit 구성과 Wear Log 착용 통계에서 제외한다.
- 독립 `Innerwear`가 존재하는 목적은 구매 후 경과 기간과 교체·재구매 주기 관리다. 이 기능은 Phase 6에서 구현한다.
- `Top-T-shirts-innerwear`는 Outfit에 실제로 포함되는 Top이므로 Phase 4 착용 통계에 포함한다.
- 흰 티셔츠 같은 기본 Item은 Phase 4의 착용량·월별 분포와 Replacement Line을 사용하고, Phase 6에서는 구매 후 경과 기간까지 더해 재구매 판단에 사용한다.
- 통계를 위해 기존 category 저장값을 합치거나 다시 쓰지 않는다.

### 4.3 기간·계절 필터

- 기간은 `Lifetime` 또는 달력 연도를 선택할 수 있다.
- 복수 계절은 OR 조건으로 계산한다.
- 여러 선택 계절과 겹치는 Item도 한 번만 집계한다.
- 계절 필터는 Item의 저장된 계절 태그를 사용한다. 착용일의 월을 임의로 계절로 변환하지 않는다.
- 월별 실제 착용 분포는 계절 태그가 아니라 Wear Log의 실제 날짜를 사용한다.
- Statistics의 필터 상태는 HOME과 Closet의 필터를 덮어쓰지 않고 독립적으로 보존한다.

### 4.4 실제 착용 분포와 모바일 그래프

Item의 실제 착용 분포는 전체 Wear Log를 1월부터 12월까지 월별로 합산한 값이다. 최근 12개월 rolling이나 선택 연도만의 12칸이 아니다.

```text
해당 Item이 포함된 Outfit의 모든 Wear Log
→ Wear Log 하나마다 해당 Item을 1회 집계
→ 연도와 관계없이 month 1~12로 그룹화
→ 월별 실제 착용 횟수 12개 생성
```

예를 들어 2023년 1월 2회, 2024년 1월 3회, 2025년 1월 1회 착용했다면 1월 막대는 6회다.

UI 명칭은 `Heatmap` 대신 `월별 착용 분포`를 사용한다. 모바일에서는 12개월을 세로 목록으로 만들지 않고 다음 저높이 그래프를 사용한다.

```text
횟수     6        3   1                    5
        █        █   █                    █
        █        █   █                    █
        █        █   █                    █
월      1  2  3  4  5  6  7  8  9 10 11 12
```

- 1월부터 12월까지 12개 열을 한 줄에 동일한 폭으로 배치한다.
- 각 월의 막대는 아래에서 위로 자라는 세로 막대다.
- 모든 달을 모바일 viewport 안에 표시하고 이 그래프 자체에 가로 스크롤을 만들지 않는다.
- 그래프 높이는 고정된 낮은 영역으로 제한해 Item 상세의 세로 길이를 절약한다.
- 막대 높이는 해당 Item의 최대 월 착용 횟수를 기준으로 상대 표시하되 실제 횟수도 확인할 수 있어야 한다.
- 0회인 달도 축에서 생략하지 않는다.
- 12개월 모두 1회 이상 기록이 있으면 `연중 착용 · 12/12개월`을 표시한다.
- 막대의 색이나 높이만으로 의미를 전달하지 않고 각 월과 횟수의 접근성 이름을 제공한다.
- 그래프 근처에 전체 기록 기간과 총 착용 횟수를 표시해 짧은 관측 기간을 연중 미착용으로 오해하지 않게 한다.

### 4.5 Replacement Lineage 의미

Replacement Lineage는 구매일 순서로 자동 생성되는 목록이 아니다. 같은 역할을 맡은 Item 사이에서 J가 확인한 대체 관계와 취향 변화의 기록이다.

- 구매일과 Retired 상태는 방향 검토의 힌트일 뿐 자동 판정 기준이 아니다.
- 세대 `G0`, `G1`, `G2`는 확인된 방향 edge에서 계산한 graph depth다.
- 같은 해 구매했어도 parent·child가 될 수 있고, 구매 연도가 달라도 같은 세대 또는 병렬 후보일 수 있다.
- 모든 세대의 Item thumbnail은 같은 크기로 표시한다.
- 실제로 확인된 가지가 있을 때만 가지 UI를 표시한다.
- Style Identity는 여러 Line을 묶어 보는 관리용 label로 유지하며 별도 테이블이나 독립 편집 시스템으로 확대하지 않는다.

## 5. 범위

### 5.1 포함

- Lifetime·연도·카테고리·계절 기준의 Item Statistics
- 현재 보유 Item 활용률
- Most Worn, Never Worn, 선택 연도 미착용
- 카테고리별 Active 보유 현황
- Item별 1~12월 실제 착용 분포
- 통계 숫자에서 최대 4개 미리보기와 전체 Item 목록으로 이동
- 53개 Line과 165개 membership 읽기 전용 Overview
- Active/Retired, Active 수, 최근 Active 취득일 표시
- Style Identity 그룹과 빈 Line·단일 Item·복수 Line 소속 경고
- 49개 무방향 Legacy Link 추출과 방향 검토
- 시작점, predecessor·successor, 가지 이름, 선택 이유 편집
- 확인된 방향 edge의 DAG 저장, 순환 차단, 원자 저장
- Line 병합·보관·대표 Line 관리
- 모바일 성능·접근성·RLS 검증

### 5.2 제외

- 장소·교통수단 독립 통계
- Statistics의 전체 Outfit 순위와 별도 Outfit 분석 화면
- Favorite를 Statistics에 중복 배치하는 작업
- 장기 미착용·최근 반복의 임의 임계값 또는 경고
- 장소 Profile, HVAC, Item 체감 관측과 추천 순위 변경
- 세탁 기록과 세탁 필요 판정
- 독립 Innerwear와 기본 Item의 교체·재구매 알림
- 세일 레이더, 브라우저 푸시, 위젯, Cron
- AI 구매 추천 또는 자동 스타일 평가
- Retired Item과 과거 Wear Log의 물리 삭제
- 과거 Outfit의 Item relation 직접 변경
- 근거가 불명확한 단일 옷장 점수

## 6. Statistics 계산 계약

### 6.1 활용률

```text
대상 Item
= 현재 Active
+ 대상 카테고리
+ 선택 계절 중 하나 이상과 겹침
+ 선택 기간 종료일까지 취득

사용 Item
= 대상 Item 중 선택 기간에 Wear Log가 1건 이상 존재

활용률
= 사용 Item 수 ÷ 대상 Item 수
```

- 달력 연도는 1월 1일부터 12월 31일까지를 포함한다.
- 현재 연도는 오늘까지의 Wear Log를 사용한다.
- 복수 계절과 복수 category에 걸친 Item은 Item ID로 중복 제거한다.
- 과거 연도를 선택했을 때 화면 명칭은 `현재 보유 옷의 YYYY년 활용률`로 표시한다.
- 현재 `retired_on`이 없으므로 과거 연도 당시의 옷장 상태를 복원했다고 표현하지 않는다.
- 현재 Retired지만 선택 연도에 착용한 Item은 Most Worn 기록에는 나올 수 있으나 현재 보유 옷 활용률 분모에는 들어가지 않는다.

### 6.2 취득일 미상

- 현재 연도와 Lifetime의 Never Worn에는 취득일 미상 Item도 포함한다.
- 과거 연도 활용률과 해당 연도 미착용 분모에서는 취득일 미상 Item을 제외한다.
- 화면에는 `취득일 미상 N개 제외`를 표시한다.
- 기간 중 새로 취득한 미착용 Item에는 취득일을 함께 표시해 연초부터 방치한 Item처럼 보이지 않게 한다.
- 취득일을 임의로 추정하거나 채우지 않는다.

### 6.3 주요 결과

- `활용률`: 현재 Active 대상 Item 중 선택 기간 사용 Item의 비율
- `Most Worn`: 선택 기간의 실제 Item 착용 횟수 순위
- `Never Worn`: Lifetime Wear Log가 0건인 현재 대상 Item
- `해당 연도 미착용`: 해당 연도 말까지 취득한 현재 대상 Item 중 그 연도 Wear Log가 0건인 Item
- `보유 현황`: 대상 category별 현재 Active Item 수
- `월별 착용 분포`: Item별 전체 Wear Log의 1~12월 합계

모든 결과에는 기간, 상태, 제외 규칙과 계산 원본을 확인할 수 있는 설명을 제공한다. `착용하지 않았다`와 `기록이 없다`를 동일한 사실로 과장하지 않는다.

## 7. 화면 구조

### 7.1 Statistics 홈

```text
MORE → Statistics
→ 기간 선택
→ 계절·카테고리 선택
→ 활용률
→ Most Worn
→ Never Worn / 해당 연도 미착용
→ 카테고리 보유 현황
```

- 각 Item 결과는 최대 4개만 먼저 표시한다.
- 숫자나 `더 보기`를 누르면 같은 조건의 Closet 목록으로 이동한다.
- 뒤로 가면 Statistics의 기간·필터·스크롤 위치를 복원한다.
- 빈 결과에는 적용 중인 기간·계절·카테고리 기준을 함께 표시한다.

### 7.2 Item 상세

- 월별 착용 분포 세로 막대 그래프
- 총 착용 횟수와 기록 기간
- `연중 착용` 여부와 착용 월 수
- 현재 Item이 속한 Replacement Line 진입점
- 기존 Outfit 및 Wear Log 상세 흐름 유지

### 7.3 Replacement Line Overview

```text
MORE → Replacement Lines
→ Line 이름의 색상과 기존 Item HEX로 만든 Color Index
→ 선택한 색상의 Line 목록
→ Line 선택 즉시 계보 상세
```

첫 화면에는 전체 Line 목록 대신 색상 tile만 표시한다. 한 Replacement Line 안의 Item은 예외 없이 같은 색상 계열이라는 운영 규칙을 사용하고, Line 이름에 포함된 색상명을 분류 원본으로 삼는다. tile의 배경색은 해당 Line Item의 기존 `displayHex`를 집계해 표시하며 밝기에 따라 글자 대비를 바꾼다.

색상을 선택한 뒤의 Line 목록에는 다음을 표시한다.

- Line 이름과 보조 정보인 Style Identity
- Active Item 수와 전체 Item 수
- 빈 Line, 단일 Item Line, 복수 Line 소속 Item
- Line 카드 전체를 누르면 중간 membership Item 목록이나 별도 `계보 보기` 버튼 없이 `/replacement-lines/:lineId`로 이동

Legacy Link 진행률과 전체 Line 품질 요약은 주 탐색 흐름을 늘리지 않도록 첫 화면의 접힌 `Line 관리 현황`에 유지한다. Style Identity는 색상보다 상위 navigation이 아니라 Line 카드의 보조 label로 유지한다.

### 7.4 Line 상세와 계보

- 검토 전에는 연결선을 무방향으로 표시하고 화살표·세대를 추정하지 않는다.
- 검토 후에는 확인된 시작점과 edge로 세대와 가지를 계산한다.
- 모바일은 위에서 아래로 이어지는 계보를 기본으로 한다.
- parent, child, 손자 세대의 thumbnail을 모두 같은 크기로 표시한다.
- 가지가 갈라질 때 연결선과 가지 이름을 함께 표시하되 Item 카드 크기는 줄이지 않는다.
- 구매일, Active/Retired, 선택 이유는 Item 카드 또는 펼침 상세에서 확인한다.

#### 확정 UI 기준

계보 화면은 2026-08-03에 확정한 `ITEM LINEAGE · Ivory Layered` 기준안의 구조를 따른다. 이 기준은 단순한 세로 목록이 아니라 다음의 세대별 묶음과 바깥쪽 branch connector를 포함한다.

```text
ITEM LINEAGE
Line 이름
사용 중 N · Retired N

┌ G0 · 시작 아이템 ─────────────────┐
│ [같은 크기 thumbnail] Item · 연도 · 상태 │
└───────────────────────────────────┘
                 │
┌ G1 · 시작 아이템에서 이어진 후보 N ┐
│ [thumbnail] Item · 연도 · 상태 · 이유  │
│ [thumbnail] Item · 연도 · 상태 · 이유  │
└───────────────────────────────────┘
      ├──── G2 · A에서 이어짐
      └──── G2 · B에서 이어짐
```

- 화면 머리에는 `ITEM LINEAGE`, Line 이름, 사용 중·Retired 합계를 표시한다.
- 각 세대는 `G0`, `G1`, `G2`와 세대의 의미를 적은 header를 가진 하나의 둥근 묶음 카드다.
- 같은 세대의 병렬 후보는 카드 안의 독립 행으로 쌓으며 각 행의 thumbnail 크기와 정보 열을 동일하게 유지한다.
- Item 행은 이름, 취득 연도, 상태 badge와 선택 이유를 표시한다. 수량처럼 원본에 없는 값은 화면을 맞추기 위해 추정하지 않는다.
- 상태 badge는 최소 `사용 중`, `Retired`, `이어짐`을 구분하고 색만으로 의미를 전달하지 않는다.
- G0에서 G1로 이어지는 단일 연결선과, predecessor별 G2 묶음으로 갈라지는 바깥쪽 branch connector를 표시한다.
- 가지가 여러 개면 G2를 한 카드에 섞지 않고 `A에서 이어짐`, `B에서 이어짐`처럼 predecessor 기준의 별도 묶음으로 나눈다.
- 깊이가 늘어나도 thumbnail을 축소하지 않으며 모바일 한 열에서 가로 스크롤 없이 위에서 아래로 읽히게 한다.

## 8. Replacement Line 정리 흐름

### 8.1 P4-2A Line Overview

먼저 쓰기 기능 없이 기존 원본을 이해한다.

- 53개 Line과 165개 membership을 원격 기준선과 대조
- Line별 Active/Retired와 Active 수 표시
- Style Identity별 그룹
- 빈 Line·단일 Item·복수 Line 소속 표시
- 49개 Legacy Link를 화살표 없는 연결선으로 표시
- 취득일과 Retired 상태를 참고 정보로 표시

Notion의 기존 `Active Count`, `Newest Active Age`, `Risk Threshold`, `멸종 관리` Formula를 그대로 복제하지 않는다. 다만 Active Item 수는 Line의 현재 생존 상태를 이해하는 직접 근거이므로 Overview에 포함한다.

### 8.2 P4-2B Legacy Link Review

각 무방향 pair를 다음 흐름으로 검토한다.

```text
Item A — Item B
→ 두 Item을 같은 크기로 비교
→ 취득일·상태·기존 Line 확인
→ 관계 선택
→ 선택 이유 기록
→ 다음 미검토 pair
```

관계 선택지는 다음 의미를 구분한다.

- `A → B`: A가 이전 Item, B가 후속 Item
- `B → A`: B가 이전 Item, A가 후속 Item
- `동등·병렬 후보`: 서로 직접 parent·child로 저장하지 않음
- `대체 관계 아님`: Legacy Link를 계보 edge로 변환하지 않음

방향을 선택한 경우에만 directed edge를 만든다. 동등·병렬 후보와 대체 관계 아님도 검토 완료 결과로 보존해 같은 질문이 다시 나타나지 않게 한다.

### 8.3 P4-2C Lineage Editing

Legacy Link 검토 뒤 다음 편집을 연다.

- 시작점 지정
- predecessor·successor 추가·변경
- 가지 이름과 선택 이유 기록
- 순환 연결 차단
- Line 병합·보관
- 대표 Line 지정
- membership 변경 시 관련 Line을 `needs_review`로 되돌림
- 여러 edge 변경을 중간 상태 없이 원자 저장

확인 완료 조건은 다음과 같다.

> 모든 Item은 시작점으로 지정되거나 하나 이상의 incoming predecessor edge를 가져야 하며, 각 연결 구성요소에는 최소 한 개의 시작점이 있어야 한다.

DAG를 수용하는 데이터 구조는 준비하되 가지 이름 상속, 합류 배지, 복잡한 branch 전용 UI는 실제 가지나 합류 사례가 확인된 뒤 확장한다.

실사용 중 잘못 연결한 edge는 같은 Line 안에서 predecessor를 다시 고르거나 완전히 해제할 수 있다. 해제한 successor에 다른 confirmed incoming edge가 없다면 해당 Item을 명시적 시작점으로 보존한다. 다른 Line으로 membership을 옮기는 작업은 모든 edge를 먼저 해제한 Item에만 허용하고, Line 관리 폼과 atomic RPC에서 기존 Line 선택 또는 새 Line 생성을 처리한다.

선택 이유는 매번 주관식으로 쓰지 않고 `단순 교체`, `멸종 후 교체`, `계승 👑` 세 가지 중 하나를 고른다. 기존 자유 입력 이유는 새 편집 폼의 기본값으로 복원하지 않고, 다음 수정 때 표준 선택지로 다시 판단한다. 분기 세대는 데스크톱에서 카드 왼쪽 바깥 rail과 elbow connector로 구분하고, 모바일에서는 카드 폭을 침범하지 않도록 들여쓰기를 줄인다.

## 9. 데이터와 보안

### 9.1 기존 원본

- `closet_items`
- `closet_outfits`
- `closet_outfit_items`
- `closet_wear_logs`
- `closet_replacement_lines`
- `closet_replacement_line_items`

Item Statistics만을 위해 Wear Log나 Item에 중복 집계값을 저장하지 않는다. 현재 규모에서는 authenticated snapshot과 순수 계산 모듈로 먼저 검증하고, 실제 모바일 측정에서 문제가 있을 때만 RLS를 통과하는 View 또는 RPC를 검토한다.

### 9.2 Legacy Link와 directed edge

- 49개 무방향 pair는 Notion 원본 ID를 보존해 한 번만 가져온다.
- pair의 Item 순서는 의미가 없으며 정규화된 고유 제약으로 중복을 막는다.
- Legacy Link의 검토 상태와 선택 결과를 보존한다.
- 확인된 predecessor·successor만 별도 directed edge로 저장한다.
- edge에는 workspace, Line, 두 Item, 출처, 검토 상태를 추적할 수 있어야 한다.
- 가지 이름과 선택 이유는 출처 Legacy Link를 추적하는 edge에 저장하며, 빈 가지 이름은 `null`로 정규화한다.
- 구매일로 direction을 자동 seed하지 않는다.

### 9.3 쓰기 안전성

- P4-0과 P4-2A는 production을 변경하지 않는 읽기 전용 단계다.
- 쓰기 schema와 RLS는 P4-2B 검토 UI 계약이 확정된 뒤 migration으로 추가한다.
- authenticated frontend에는 Legacy Link와 revision table의 직접 INSERT·UPDATE·DELETE 권한을 열지 않는다. 최초 검토와 재검토는 workspace membership, 선택지, 필수 이유, 화면이 읽은 `updated_at`을 다시 검사하는 RPC만 실행할 수 있게 한다.
- Line과 Item의 workspace 일치를 DB와 repository 양쪽에서 검증한다.
- directed edge는 self-edge와 cycle을 차단한다.
- 여러 membership·edge 변경은 RPC 트랜잭션을 검토한다.
- 영구 삭제보다 보관과 검토 결과 보존을 우선한다.
- 원격 적용 전 pgTAP, Advisor, production 전후 count 검증을 수행한다.

## 10. 구현 단계

### P4-0. Legacy Feature Audit와 원격 기준선

목표: 구현 전에 기존 결정, 새 결정, 보류 기능과 실제 데이터 기준선을 확정한다.

- [x] production Item·Outfit·Wear Log 수량 재확인
- [x] 442개 취득일 있음·9개 미상 기준 재확인
- [x] 53개 Line·165개 membership·163개 고유 Item 기준 재확인
- [x] 빈 Line 1개·복수 Line Item 2개 등 품질 상태 재확인
- [x] 98개 reciprocal entry가 49개 무방향 pair인지 재현 가능한 audit 작성
- [x] 기존 Notion Formula·View 중 Phase 4에서 유지·재설계·보류할 개념 기록
- [x] production과 Notion 원본을 변경하지 않음

완료 조건:

- [x] 이 문서가 production·Notion 원본의 수량과 알려진 출처 차이를 정확히 기록한다.
- [x] 방향 있는 edge를 자동 생성하지 않는다.
- [x] Statistics 계산 입력과 제외 규칙이 fixture로 작성 가능할 만큼 명확하다.

### P4-1A. Item Statistics 계산 계약

- [x] Lifetime·달력 연도 기간 model
- [x] 복수 계절 OR와 Item ID 중복 제거
- [x] 대상 category와 독립 Innerwear 제외 규칙
- [x] 현재 보유 옷 활용률
- [x] Most Worn, Never Worn, 해당 연도 미착용
- [x] 취득일 미상 제외 수
- [x] Item별 전체 1~12월 착용 합계
- [x] 같은 날짜·같은 Outfit의 복수 Wear Log 보존
- [x] `Top-T-shirts-innerwear`, `-made`, Bags 중복 회귀 테스트

### P4-1B. Statistics와 Item 상세 UI

- [x] 기간·계절·카테고리 필터
- [x] 최대 4개 미리보기와 전체 Item 목록 이동
- [x] 과거 연도 활용률의 정확한 명칭과 제외 수 표시
- [x] Item 상세의 저높이 12개월 세로 막대 그래프
- [x] `연중 착용 · 12/12개월` 표시
- [x] 필터·스크롤 복원
- [x] 390px 모바일에서 12개월 전체 표시와 가로 overflow 부재 확인

### P4-2A. Replacement Line Overview

- [x] Replacement Line TypeScript model과 lazy repository query
- [x] Style Identity 그룹과 Line 목록
- [x] Active/Retired, Active 수, 최근 Active 취득일
- [x] 빈 Line·단일 Item·복수 Line 소속 경고
- [x] 49개 Legacy Link 무방향 표시
- [x] workspace 외 데이터 비노출 확인

P4-2A 화면은 production에 추출된 49개 pair와 실제 검토 진행률을 읽으며, 검토 전 pair를 화살표 없는 Item A—Item B로 표시한다. Item ID를 정적 frontend asset에 넣거나 Line membership에서 관계를 추측하지 않고, P4-2B의 canonical pair schema·일회 추출·workspace RLS를 원본으로 사용한다.

### P4-2B. Legacy Link Review

- [x] 49개 pair review queue
- [x] 동일 크기 Item 비교 카드
- [x] 취득일·상태·Line 참고 정보
- [x] A→B, B→A, 동등·병렬, 대체 관계 아님 선택
- [x] 선택 이유 입력
- [x] 검토 진행률과 중단 후 복원
- [x] 확인된 선택만 저장하는 preview·confirm 단계

P4-2B의 canonical pair schema, workspace RLS, 49-pair importer와 검토 화면을 production에 적용하고 검증했다. J가 실제 49개를 모두 검토해 49/49가 완료됐으며 A→B 8개, B→A 37개, 동등·병렬 1개, 대체 관계 아님 3개가 저장됐다. 방향 자동 선택, 기존 행 삭제, 검토 결과 추측은 수행하지 않았다.

### P4-2C. Lineage Editing

- [x] 완료한 Legacy Link 재검토와 append-only revision 이력
- [x] directed edge schema·migration·RLS
- [x] 시작점과 predecessor·successor 편집
- [x] cycle·self-edge·workspace 불일치 차단
- [x] 가지 이름·선택 이유 인라인 편집과 전용 RPC
- [x] predecessor 재선택, edge 해제와 successor 시작점 전환
- [x] 선택 이유 3종 드롭다운과 왼쪽 branch connector
- [x] 연결 없는 Item의 기존·새 Line 이동 UI와 원자 RPC 로컬 구현
- [x] Line 없는 Closet Item 검색·추가와 edge 없는 Item의 현재 Line 제외 UI·원자 RPC 로컬 구현
- [x] Item 추가·현재 Line 제외 production migration·인증 rollback·Advisor 검증
- [ ] Item 추가·현재 Line 제외 frontend 공개 배포·실제 UI 검증
- [x] Line 병합·보관·대표 Line 로컬 UI·원자 RPC 구현
- [x] Line lifecycle production migration·인증 RPC·rollback·Advisor 검증
- [x] membership 변경 시 `needs_review` production migration·인증 RPC·Advisor 검증
- [x] 자동 분류보다 우선하는 Line 색상 category 직접 지정 production 적용·공개 UI 검증
- [x] Line 재검토 완료·이름/Style Identity 수정·완전 빈 Line 삭제 production 적용·rollback 검증
- [x] Replacement Lines 상단에서 대표 색상을 지정한 빈 Line 생성·상세 Item 추가 연결 production 적용·rollback 검증
- [x] 빈 Line 생성 frontend 공개 배포·production UI 검증
- [x] 같은 크기 thumbnail의 세로형 Lineage UI
- [x] 실제 가지가 있는 fixture로 분기 렌더링
- [x] 12개 색상 tile의 Color Index와 밝기별 글자 대비
- [x] 색상 선택 후 Line 카드에서 계보로 직접 이동

P4-2C의 첫 기반으로 완료한 49개 관계를 목록에서 다시 열고 기존 선택·이유를 수정할 수 있게 했다. 현재 결과는 빠른 조회용 snapshot으로 유지하되 모든 저장은 revision row를 추가하며, `updated_at` optimistic concurrency로 오래 열린 화면이 더 최신 판단을 덮어쓰지 못하게 한다. production에는 49개 현재 결과와 일치하는 최초 revision 49개가 backfill됐다. 공통 Line이 두 개인 `무탠다드 슬리브리스 — 퍼스트클로 슬리브리스` pair는 Line을 자동 선택하지 않고 directed edge 단계의 명시적 선택 대상으로 남긴다.

다음 기반으로 45개 방향 관계를 저장 전에 계산해 공통 Line이 하나인 44개, Line 선택이 필요한 1개, edge 제외 4개로 분리했다. 후보 graph에는 self-edge·중복·cycle이 없고 실제 가지 1곳과 합류 1곳이 있어 preview에 그대로 표시한다. directed edge table과 confirm RPC는 출처 검토 결과에서 방향을 다시 계산하고 composite FK, RLS, 최소 권한, optimistic concurrency와 transaction advisory lock 기반 cycle 검사로 잘못된 저장을 차단한다. 이 단계에서는 production edge를 생성하지 않는다.

Line 선택이 필요한 1개 관계에는 기본값 없는 두 선택지를 제공하고, 선택 뒤 44개 자동 귀속 후보와 함께 45개 전체를 다시 확인해야 최종 저장 동작이 나타나게 했다. 최종 저장은 한 batch RPC와 한 transaction으로 처리해 중간 후보 하나라도 유효하지 않으면 앞서 처리한 edge까지 전부 rollback한다. production rollback fixture로 이 원자성을 검증한 뒤 J가 `Ivory Layered Sleeveless`를 선택하고 최종 저장해 현재 production에는 confirmed edge 45개가 있다.

Line 관리의 첫 조각으로 계보 연결 전 Item을 기존 Line 또는 새 Line으로 옮기는 UI와 atomic RPC를 구현했다. 이동한 Item은 대상 Line의 명시적 시작점이 되고 source·target Line 모두 `needs_review`로 바뀐다. 기존 edge가 하나라도 남은 Item은 이력을 손상하지 않도록 이동을 거부한다. Demo 저장 지속성, Supabase RPC mapping, 라우트 전환, 데스크톱·390px 모바일 UI를 검증한 뒤 production migration `20260804183905_move_replacement_line_items`를 적용했다. 실제 workspace member 권한의 rollback fixture에서 기존 Line 이동과 새 Line 생성, membership·시작점·재검토 상태 변경을 확인했고 연결된 Item 이동 차단과 rollback 뒤 `53 Line · 165 membership · 87 edge · 25 start · needs_review 0` 유지를 재확인했다. RPC는 빈 `search_path`, 함수 내부 workspace membership 검사와 `authenticated` 단독 실행 권한을 사용하며 Advisor의 로그인 사용자용 `SECURITY DEFINER` 경고는 이 전용 쓰기 RPC에 대해 의도된 항목으로 검토했다.

Line 관리의 후속으로 현재 어떤 Line에도 속하지 않은 Closet Item을 이름·category·색상으로 검색해 선택한 Line에 추가하고, edge가 없는 Item은 Closet Item을 삭제하지 않은 채 현재 보고 있는 Replacement Line에서 제외하는 흐름을 구현했다. 추가 Item은 명시적 시작점이 되고, 제외는 source Line의 membership·start만 제거하며 source Line을 `needs_review`로 바꾼다. 다른 Line 소속과 계보는 보존하고 source Line에 predecessor·successor edge가 있을 때만 먼저 연결 해제를 요구한다. 초기 production RPC의 전체 Line 제거 의미는 복수 Line legacy membership 정정 흐름을 막는 문제를 확인해 forward migration `20260805000354_remove_item_from_single_replacement_line`로 교정했다. 전체 58개 파일 271개 테스트, production build와 실제 Demo browser 흐름을 통과했다. 실제 `퍼스트클로 슬리브리스`·`무탠다드 슬리브리스` rollback fixture에서 `Ivory Layered Summer` 중복 소속 2개만 제거되고 `Ivory Layered Sleeveless` 소속 2개와 edge 1개가 보존되는 것을 확인했으며 rollback 뒤 운영 데이터는 그대로다. 새 Advisor 성능 경고는 없고 signed-in 전용 `SECURITY DEFINER` 안내는 내부 workspace 검사와 최소 실행 권한을 확인한 의도된 경고다. frontend 공개 배포와 실제 production UI 검증은 남아 있다.

Item에서 새 Line으로 옮기는 기존 방향에 더해, Replacement Lines 상단에서 Line을 먼저 만들고 상세 화면에서 Item을 추가하는 반대 방향을 연결했다. 신규 Line은 이름, 선택적인 Style Identity와 필수 대표 색상 category를 기존 `closet_replacement_lines` 한 row에 저장하며 별도 table이나 임시 migration data를 만들지 않는다. production migration `20260805002809_create_empty_replacement_line` 적용 뒤 실제 workspace member claim으로 공백 정규화, active·ready 상태와 membership 0개를 transaction rollback에서 확인했고 검증용 Line은 남지 않았다. J가 공개 production UI에서 상단 Line 생성이 정상 동작하는 것을 직접 확인했다.

Line lifecycle로 삭제 대신 독립 보관·복원과 대표 Line 병합을 구현했다. 병합은 source membership·edge·유효한 시작점을 target에 원자적으로 합치고 겹치는 membership은 중복 없이 보존하며, source는 대표 Line을 가리키는 읽기 전용 보관 상태가 된다. 합친 graph의 cycle과 동일 edge 충돌은 변경 전에 차단하고 source·target을 모두 `needs_review`로 되돌린다. Color Index에서는 active Line만 보여 주고 관리 현황에서는 보관 Line과 대표 Line 연결을 다시 찾을 수 있다. production migration `20260804193058_manage_replacement_line_lifecycle` 적용 뒤 실제 workspace member claim의 transaction fixture에서 독립 보관·복원, stale·비회원 거절, archived child 수정 차단, 동일 edge·합친 graph cycle 차단과 병합 Line 직접 복원 거절을 확인했다. 실제로 두 Item을 공유하는 `Ivory Layered Summer → Ivory Layered Sleeveless` 병합도 rollback 안에서 실행해 membership `4 + 2 - 공유 2 = 4`, edge 2개, source 보관·대표 참조와 양쪽 `needs_review`를 검증했다. rollback 뒤 `53 Line · active 53 · archived 0 · 165 membership · 87 edge · 25 start · needs_review 0`과 적용 전 네 checksum이 모두 일치한다. 새 RPC 두 개는 빈 `search_path`, 함수 내부 workspace membership 검사와 `authenticated` 단독 실행 권한을 사용한다. Advisor의 두 signed-in `SECURITY DEFINER` 경고는 이 전용 쓰기 RPC에 대해 의도된 항목이며, 신규 lifecycle index의 미사용 안내는 기능 적용 직후라 예상되는 정보성 항목이다.

확정된 edge만 읽어 각 Line의 시작점과 graph depth를 계산하는 상세 화면을 `/replacement-lines/:lineId`에 추가했다. 구매 연도는 정렬·세대 판정에 쓰지 않고 DAG의 위상 관계로 G0·G1·G2 이상을 계산하며, 실제 production의 G0→G1→G2 chain, 1→2 분기, 2→1 합류를 확인했다. Line membership에는 있지만 confirmed edge에 참여하지 않은 Item은 시작점으로 추정하지 않고 `계보 연결 전`으로 분리한다. 모든 세대는 같은 thumbnail slot, 상태 badge, 취득 연도와 선택 이유를 사용하며 실제 데이터에 없는 수량과 예정 상태는 만들지 않는다.

긴 Style Identity·Line 목록을 첫 화면에서 제거하고, Line 이름의 색상 규칙과 기존 Item 팔레트 HEX를 결합한 Color Index를 추가했다. production의 53개 Line은 Black·Blue·Brown·Burgundy·Charcoal·Denim·Green·Grey·Ivory·Navy·Silver·White 12개 색상으로 누락 없이 분류된다. 색상 선택 상태는 URL query에 남겨 계보에서 뒤로 왔을 때 같은 색상 목록을 복원하며, Line 카드가 계보 상세를 직접 열어 membership 목록을 중복해서 보지 않게 했다.

자동 제안을 사람이 정한 값으로 덮어쓸 수 있도록 기존 `closet_replacement_lines`에 nullable `color_category` column 하나와 인증된 optimistic update RPC를 추가했다. 별도 색상 table이나 자동 분류 이력은 만들지 않았다. 계보 상세의 Line 관리에서 20개 category를 선택·수정하거나 `자동 제안 사용`으로 되돌릴 수 있고, 직접 지정 값은 Line 이름·Item 팔레트 기반 제안보다 항상 우선한다. 새 frontend를 schema cleanup보다 먼저 안전하게 배포할 수 있도록 column 부재 오류에 한해서만 기존 Line SELECT로 재시도한다. production migration `20260804213528_add_replacement_line_color_category` 적용 뒤 공개 앱에서 `Royal Blue Summer Top`을 Blue로 저장하고 다시 자동 제안으로 초기화해 nullable source of truth와 실제 저장 경로를 확인했다. 현재 53개 Line의 직접 지정 값은 모두 null이며 J가 앱에서 천천히 채울 수 있다.

membership 이동 뒤 남던 `needs_review` 상태를 사람이 마무리할 수 있도록 `재검토 완료` action을 추가하고, 같은 Line 관리 화면에서 이름과 선택적인 Style Identity를 수정할 수 있게 했다. Item뿐 아니라 edge·시작점·병합 대표 참조까지 전부 없는 active standalone Line만 완전히 삭제할 수 있으며, 나머지는 기존 보관·병합 흐름을 사용한다. 세 동작은 기존 Line table을 그대로 쓰는 authenticated 전용 RPC로 설계해 새 table을 만들지 않았고 workspace membership, row lock, `updated_at` optimistic concurrency를 다시 검사한다. production migration `20260804230012_manage_replacement_line_review_and_metadata`를 적용하고 실제 workspace member claim으로 `Black Flat Shoes → Black Shoes Flat` 정보 수정을 transaction 안에서 실행해 반환값과 timestamp 전진을 확인한 뒤 rollback했다. 기존 `56 Line · 165 membership · 90 edge · 32 start`와 원본 Line 이름·Style Identity는 그대로 유지된다.

확정된 edge의 `선택 이유`와 선택적인 `가지 이름`을 계보 Item 행에서 바로 수정하는 인라인 UI를 구현하고 production migration `20260803173959_revise_replacement_line_edge_details`를 적용했다. 전용 RPC는 workspace membership, 입력 길이, confirmed 상태와 화면이 읽은 `updated_at`을 다시 검사하며 predecessor·successor, Line, 출처와 상태는 변경하지 않는다. transaction rollback fixture에서 실제 수정 성공, stale `updated_at` 충돌, 비회원·anon 거절을 확인했고 원본 45개 edge와 표본 이유·시간이 그대로 유지되는 것을 재확인했다. 함수 실행 권한은 `authenticated`와 `service_role`에만 있으며 `public`·`anon`에는 없다. 색상 category는 현재 Line 이름과 팔레트 기반 자동 분류이고, J가 직접 지정한 값이 자동 분류보다 우선하는 편집 기능은 별도 후속 항목으로 남긴다.

기존 confirmed edge의 predecessor·successor를 확인 뒤 교환하는 `방향 바꾸기` UI와 production migration `20260803182849_reverse_replacement_line_edge`를 추가했다. 방향 전환 RPC는 출처 Legacy Link의 검토 결정을 반대로 revise해 append-only revision을 남긴 뒤 같은 edge를 다시 confirmed로 만들며, 이 과정을 한 transaction에서 처리한다. 기존 cycle trigger가 새 방향을 검증하므로 순환이 생기면 Legacy revision과 edge 변경이 함께 rollback되고, 화면이 읽은 edge `updated_at`과 workspace membership도 다시 검사한다. production rollback fixture에서 edge 방향 교환, Legacy 결정 반전, revision 증가, timestamp 전진과 confirmed 유지, stale·비회원 거절을 확인한 뒤 원본 45개 edge와 표본 revision이 그대로인 것을 재확인했다. 명시적 시작점 지정과 신규 수동 관계 생성은 별도 후속 데이터 구조로 남긴다.

명시적 시작점과 Legacy Link가 없는 신규 연결을 위해 production migration `20260803185015_add_replacement_line_starts_and_manual_edges`를 적용했다. 시작점은 별도 table에 저장해 incoming edge와 동시에 존재하지 못하게 하고, 수동 edge는 기존 Legacy Link 출처를 흉내 내지 않도록 `source_kind = 'manual'`과 nullable `source_legacy_link_id`로 구분한다. `계보 연결 전` Item에서 시작점으로 지정하거나 Line의 다른 Item을 predecessor로 골라 선택 이유·가지 이름과 함께 연결할 수 있으며, G0에서도 명시적 시작점을 지정·해제할 수 있다. 새 RPC는 workspace membership, Line membership, self-edge, 중복, cycle과 시작점 충돌을 다시 검사하며 table 직접 쓰기는 열지 않는다. production rollback fixture에서 시작점 지정·해제, 수동 edge 생성, incoming Item의 시작점 지정 거절, cycle과 비회원 쓰기 거절을 확인했고, rollback 뒤 기존 confirmed edge 45개·수동 edge 0개·명시적 시작점 0개가 유지됐다. 기능은 준비됐지만 실제 미연결 Item을 시작점 또는 incoming edge로 분류하는 판단은 J가 앱에서 차례로 저장해야 하므로 전체 데이터 완료 조건은 아직 열어 둔다.

실사용 정정 도구로 기존 confirmed edge의 predecessor, 선택 이유와 가지 이름을 한 폼에서 다시 고르고, edge를 해제해 successor를 같은 Line의 명시적 시작점으로 전환했다. 선택 이유는 `단순 교체`, `멸종 후 교체`, `계승 👑`로 제한하고 기존 자유 입력 이유는 다음 편집 때 빈 선택으로 다시 판단하게 한다. 여러 G0에서 갈라진 세대는 prototype처럼 카드 왼쪽 rail에 연결하고 모바일에서는 들여쓰기를 줄였다. production migration `20260804010637_edit_replacement_line_connections` 적용 뒤 transaction rollback fixture로 부모 변경, stale 충돌, edge 해제, G0 전환과 비회원 거절을 확인했고, J가 저장한 현재 `57 confirmed edge · 12 manual edge · 4 explicit start`와 전체 checksum이 그대로 유지됐다. 다른 Line으로 Item을 옮기거나 새 Line을 만드는 membership 편집은 Line 관리 후속 작업으로 남는다.

### P4-3. 통합 검증과 공개

- [x] TypeScript 검사, 전체 Vitest, production build
- [ ] Item 통계와 production Wear Log 표본·전체 집계 대조
- [ ] PC와 iPhone 크기에서 Statistics·Item 상세·Lineage QA
- [x] 키보드 탐색, focus, label, 그래프 접근성 확인
- [x] 초기 데이터·이미지 요청량과 렌더 시간 비교
- [x] schema 변경 시 격리 pgTAP, RLS, grant, Advisor 검증
- [x] production 적용 전후 Line·membership·edge count 검증
- [x] GitHub Pages 배포와 공개 asset·로그인 화면 확인

2026-08-05 마감 QA에서 Line 생성 disclosure의 Enter 키 실행과 이름 필드 `autoFocus`, label 연결, Item 상세 링크의 Enter 키 이동을 자동 테스트로 고정했다. 계보 묶음은 이름 있는 `region`으로 노출하고 세대 card는 heading이 연결된 section, connector는 `aria-hidden` 장식 요소로 확인했다. 데스크톱과 390px 계보 표본에서 blocking overlay·가로 넘침·console warning/error가 없었고 focus outline은 `2.4px solid`로 계산됐다.

같은 로컬 Vite Demo의 warm reload 3회 중앙값은 Color 첫 화면 149ms, 2개 Item 계보 211ms, Statistics 236ms였다. Color 첫 화면은 Item image element·image asset 요청이 모두 0개였고, 계보는 2개 Item 중 실제 image asset 1개만 요청했다. page 전용 데이터 조회는 공통 App snapshot 밖에서 Color 첫 화면 3회(Line·membership 병렬 2회 + Legacy Link 1회), 계보 4회(Line·membership 병렬 2회 + edge·start 각 1회)이며 각 묶음은 병렬 실행한다. 이 수치는 production network 지연이 아닌 동일 기기·Demo 상대 비교 기준이다.

production catalog에서 4개 Lineage table 모두 RLS가 켜져 있고 anon 권한 없음, authenticated SELECT만 허용, 직접 INSERT·UPDATE·DELETE 없음과 각 table의 workspace policy를 확인했다. 17개 Lineage RPC는 anon/public 실행이 차단되고 authenticated만 실행 가능하며 `SECURITY DEFINER` + 빈 `search_path`를 유지한다. Security Advisor의 해당 경고는 이 전용 쓰기 경계에 대한 의도된 항목이고, Performance Advisor의 Lineage 신규 항목은 작은 start table의 FK 보조 index 권고 1건과 사용 초기 index의 미사용 정보뿐이다. production과 Git의 Closet migration은 35개이며 최신 `20260805002809`까지 일치한다. GitHub Actions run `30967739713`에서 현재 `main`을 새 Supabase DB에 처음부터 적용한 뒤 5개 pgTAP 파일·92개 test가 모두 통과했고 컨테이너 정리까지 성공했다. Node 20 기반 action이 Node 24에서 강제 실행된다는 deprecation 안내만 있었으며 test 결과에는 영향을 주지 않았다.

## 11. 테스트 기준

### 11.1 Item Statistics

- 기간 시작일·종료일 포함
- 현재 연도와 과거 연도의 명칭·분모 차이
- 취득일이 기간 전·기간 중·기간 후·미상인 Item
- 복수 계절 OR와 Item 중복 제거
- 독립 `Innerwear` 제외와 `Top-T-shirts-innerwear` 포함
- `-made` category와 Bag 중복 제거
- 같은 날짜의 같은 Outfit 복수 Wear Log
- Item이 여러 Outfit에 포함된 경우의 착용 횟수
- Retired Item의 과거 Most Worn 보존
- Never Worn과 선택 연도 미착용 구분
- 실제 Wear Log month 합계와 1~12월 0회 보존
- 12개월 모두 착용한 Item의 `연중 착용` 표시

### 11.2 Replacement Lineage

- 98 reciprocal entry를 49개 pair로 한 번만 가져옴
- pair의 A/B 저장 순서와 무관한 중복 차단
- 검토 전 화살표·세대 미표시
- A→B와 B→A 방향 저장
- 동등·병렬과 대체 관계 아님을 directed edge로 만들지 않음
- 시작점과 incoming edge 완료 조건
- self-edge와 cycle 차단
- 단일 Item Line과 복수 연결 구성요소
- 복수 Line 소속 Item과 Line 병합
- 세대가 깊어져도 thumbnail 크기 유지
- 실제 branch에서 연결선과 가지 이름 표시

### 11.3 UI·보안

- 390px에서 통계 그래프와 Lineage의 가로 overflow 없음
- 12개 월 모두 tap·focus·screen reader 이름 제공
- 긴 Item·Line·Style Identity·가지 이름
- 빈 결과, 부분 데이터, 오류 후 재시도
- 비회원과 다른 workspace row 거절
- read-only 단계의 frontend write 불가
- UPDATE를 열 경우 SELECT·USING·WITH CHECK 동작
- migration 재실행 안전성, FK, index, Advisor

## 12. 위험과 대응

| 위험 | 대응 |
|---|---|
| 통계가 다시 긴 순위 목록이 됨 | Item 질문 5개와 최대 4개 미리보기에 집중하고 전체 목록은 별도 탐색 |
| 지정 계절과 실제 착용 월을 혼동 | 계절 필터는 Item 태그, 월별 분포는 Wear Log 날짜로 명시적으로 분리 |
| 12개월 그래프가 모바일 높이·폭을 차지 | 한 줄 12열의 고정 저높이 세로 막대, 가로 스크롤 금지 |
| 막대의 상대 높이를 절대 착용량으로 오해 | 실제 월별 횟수, 총 착용 수, 기록 기간을 함께 표시 |
| 독립 Innerwear가 착용률을 왜곡 | Outfit 통계에서 제외하고 Phase 6 구매주기 대상으로 명시 |
| `Top-T-shirts-innerwear`까지 속옷으로 제외 | Top으로 포함하는 회귀 fixture 유지 |
| 98개 entry를 98개 directed edge로 잘못 이전 | reciprocal pair audit와 49개 무방향 고유 제약 적용 |
| 구매일이 세대를 자동 결정 | 구매일은 검토 힌트로만 표시하고 사람이 confirm |
| 복잡한 가계도 UI를 실제 데이터보다 먼저 구현 | 동일 크기 chain을 기본으로 하고 확인된 branch fixture 뒤 확장 |
| Line 편집 중 불완전한 graph 노출 | preview·confirm과 원자 저장, membership 변경 시 needs_review |
| 추천·세탁 요구가 Phase 4에 다시 섞임 | Phase 5·6 경계를 Roadmap과 완료 정의에서 함께 유지 |

## 13. 완료 정의

### Phase 4 Statistics 완료

- [ ] 현재 보유 Item의 Lifetime·연도별 활용률을 정확한 분모와 함께 확인할 수 있다.
- [ ] Most Worn, Never Worn, 선택 연도 미착용과 실제 Item 목록을 확인할 수 있다.
- [ ] 독립 Innerwear가 제외되고 `Top-T-shirts-innerwear`가 Top으로 포함된다.
- [ ] Item 상세에서 실제 Wear Log 기반 1~12월 착용 분포를 한 줄 세로 막대 그래프로 확인할 수 있다.
- [ ] 12개월 모두 입은 Item에 `연중 착용`이 표시된다.
- [ ] 장소·교통수단·전체 Outfit 순위를 불필요한 독립 통계로 추가하지 않는다.

### Phase 4 Replacement Lineage 완료

- [x] 53개 Line과 165개 membership을 숨김이나 임의 삭제 없이 확인할 수 있다.
- [x] 98개 reciprocal entry가 49개 무방향 Legacy Link로 보존된다.
- [x] 각 Legacy Link의 방향·동등·제외 여부와 선택 이유를 앱에서 검토할 수 있다.
- [x] 확인된 edge만 방향 있는 계보로 저장되며 cycle과 workspace 불일치가 차단된다.
- [ ] 각 연결 구성요소에 시작점이 있고 모든 Item이 시작점 또는 incoming edge를 가진다.
- [x] G0·G1·G2가 구매 연도가 아니라 확인된 graph depth로 표시된다.
- [x] 모든 세대의 thumbnail이 같은 크기이며 실제 가지가 있을 때만 branch를 표시한다.
- [x] Line 병합·보관·대표 Line과 재검토 상태가 안전하게 동작한다.
- [ ] Line 미소속 Item 추가와 Item의 현재 Line 제외가 공개 frontend UI에서 검증된다.

### Phase 4 전체 완료

- [ ] 통계와 Lineage가 모바일 성능·접근성·RLS 검증을 통과한다.
- [ ] 기존 HOME 추천, Closet, Lookbook, Calendar, Outfit 고정 구성, Wear Log 기록에 회귀가 없다.
- [ ] Phase 5 추천 알고리즘과 Phase 6 관리 주기가 Phase 4 구현에 암묵적으로 섞이지 않는다.
