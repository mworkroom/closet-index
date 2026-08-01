# Closet Index Phase 4 Maintenance & Insights Plan

- 작성일: 2026-08-01
- 상태: 계획 완료, P4-0 착수 전
- 목표 릴리스: Phase 4 Maintenance & Insights
- 선행 상태: Phase 3 Visual Wardrobe Expansion 구현·검증·공개 완료
- 관련 문서: [Roadmap](./roadmap.md), [Product Plan](./product-plan.md), [Phase 3 Plan](./phase-3-visual-wardrobe-plan.md), [Phase 1 Data & Security Spec](./phase-1-data-security-spec.md)

## 1. 목표

Phase 4의 목표는 옷을 등록하고 착장을 고르는 흐름 다음에 쌓인 데이터를, 실제 옷장 유지관리 판단에 사용할 수 있게 만드는 것이다.

```text
Wear Log와 Item 상태 확인
→ 세부 카테고리·착용 패턴·상황별 통계 계산
→ 오래 안 입음·최근 반복 같은 관리 신호 확인
→ Item·Outfit·Replacement Line 원본으로 이동
→ 필요한 상태만 안전하게 정리
```

Phase 4는 통계 숫자를 많이 만드는 단계가 아니다. J가 `무엇을 자주 입는지`, `무엇을 거의 쓰지 않는지`, `어떤 종류를 이미 충분히 보유했는지`, `어떤 아이템이 같은 역할을 이어받았는지`를 빠르게 이해하고 다음 행동으로 연결하는 단계다.

## 2. 현재 기준선

Phase 4는 다음 구현과 제품 결정을 그대로 이어받는다.

- Supabase가 쓰기 원본이며 Notion은 읽기 전용 보관본이다.
- Item, Outfit, Outfit relation, Wear Log는 UUID로 연결된다.
- 기존 Outfit의 Item 구성은 바꾸지 않는다. 다른 조합은 복제 또는 새 Outfit으로 저장한다.
- Outfit relation의 위치·크기·표시 방식은 Item 구성과 별개로 수정할 수 있다.
- Closet과 Outfit 생성 UI는 `Outer, Top, Bottom, Dress, Shoes, Bag, Acc` 상위 그룹을 사용한다.
- Socks는 탐색 UI에서 `Acc`에 포함한다.
- 기존 세부 카테고리는 삭제하지 않고 Statistics의 태그성 분류로 사용한다.
- 독립 `Innerwear` Item은 Closet에서 제외하고 Statistics에서만 확인한다.
- Closet과 Lookbook에는 착용 기록 0건을 찾는 `Unworn` 필터가 있다.
- HOME 추천은 직접 또는 부분 온도 근거가 있는 Outfit만 표시한다.
- 기본 Statistics는 전체 Wear Log·Outfit·Item 수, 세부 카테고리별 보유 수, Outfit·Item별 착용 순위를 제공한다.
- Replacement Line 53개와 Item relation 165개가 Phase 1 이전 당시 보존됐지만 현재 UI에는 노출되지 않는다.
- 저장 Outfit Preview는 선택적 cache다. Lookbook·Calendar는 Item cutout 실시간 합성을 유지하며 Preview 일괄 생성은 보류한다.
- 고해상도 원본 이미지를 원격에 장기 보관하지 않고, 작은 화면에서 Item을 알아볼 수 있는 품질을 우선한다.

## 3. 릴리스 전략

Roadmap의 Phase 4 항목은 모두 후보였으며, 실제 v1.0 사용에서 필요성이 확인된 기능부터 선택하기로 했다. 따라서 한 번에 세탁·교체·알림·오프라인까지 묶지 않고 세 단계로 나눈다.

### 3.1 Phase 4 Core — 이번 구현 범위

- Statistics 정보 구조 개편
- 세부 카테고리·착용량·활용률·상황별 통계
- 장기 미착용·최근 반복 착용 관리 신호
- 통계 결과에서 관련 Item·Outfit 목록으로 이동
- Replacement Line 읽기 전용 탐색과 데이터 품질 확인
- 모바일 성능·접근성·RLS 검증

### 3.2 Phase 4 Maintenance — Core 검증 후 선택

- Replacement Line 생성·이름 수정·Item 연결 편집
- 교체 순서를 표현할 데이터가 필요할 경우 별도 순서 계약 추가
- Retired와 교체 계보를 연결한 관리 흐름

### 3.3 Phase 4 Automation — 규칙 확정 후 선택

- 세탁 기록
- 세탁 필요 상태 또는 알림
- 앱 내부 알림
- 제한적 오프라인 사용

`Phase 4 Core`는 독립적으로 배포하고 종료할 수 있다. Maintenance와 Automation은 후보 기능을 전부 구현해야 한다는 이유만으로 자동 착수하지 않는다.

## 4. 범위

### 4.1 포함

- Statistics 첫 화면을 요약과 분석 진입점 중심으로 재구성
- 전체 기간과 선택 기간을 구분할 수 있는 통계 기준
- 상위 카테고리와 기존 세부 카테고리를 함께 사용하는 보유 통계
- Active·Retired·Unworn 상태별 Item 수
- Outfit·Item 착용 횟수, 최근 착용일, 기간 내 착용 비중
- 장소·교통수단·계절별 착용 통계
- 최근 반복 착용 Outfit·Item 목록
- 장기 미착용 Item·Outfit 목록
- 통계 카드에서 필터된 실제 목록 또는 상세 화면으로 이동
- Replacement Line 이름·Style Identity·연결 Item 확인
- Replacement Line의 relation 누락·Style Identity 누락 상태 표시
- 클라이언트 계산과 DB 집계의 원본·기준일·기간 표시
- workspace membership 기반 RLS와 읽기/쓰기 권한 분리

### 4.2 조건부 포함

다음 기능은 P4-0 결정과 Core 실사용 결과가 있어야 구현한다.

- Replacement Line 생성·편집
- 교체 관계의 명시적 순서 저장
- 세탁 이벤트 저장 테이블
- Item별 세탁 주기 또는 착용 후 세탁 필요 판정
- 앱 내부 알림 배지
- 브라우저 알림 또는 홈 화면 위젯
- 제한적 오프라인 cache와 지연 동기화

### 4.3 제외

- AI 구매 추천 또는 자동 스타일 평가
- 소셜 비교, 공유 통계, 공개 프로필
- Outfit 공유 이미지·내보내기
- Outfit Preview 일괄 생성 또는 목록 우선 표시
- Retired Item과 과거 Wear Log의 물리 삭제
- 과거 Outfit의 Item relation 직접 변경
- 저장값과 계산값을 구분하지 않는 점수화
- 근거가 불명확한 `옷장 건강 점수` 같은 단일 종합 점수
- 외부 서비스에 의존하는 푸시 알림을 Core 완료 조건으로 삼는 작업
- 완전 자동 세탁 관리

## 5. 제품 결정

### 5.1 상위 카테고리와 세부 카테고리의 역할

- Closet과 Outfit 구성은 현재의 7개 상위 그룹을 유지한다.
- Statistics는 원본 세부 카테고리를 보유 종류 태그로 사용한다.
- 예: `Top` 전체 수를 먼저 보여주고 그 안에서 Cardigan, T-shirts 등 세부 분포를 확인한다.
- Socks는 상위 요약에서 `Acc`, 세부 통계에서 원본 Socks 카테고리로 표시한다.
- 독립 Innerwear는 상위 탐색에서는 숨기지만 Statistics의 별도 그룹에서 집계한다.
- 통계를 위해 기존 Item category 값을 합치거나 다시 쓰지 않는다.

### 5.2 통계는 행동으로 이어져야 한다

각 통계는 가능한 경우 숫자만 표시하지 않고 관련 목록으로 연결한다.

- `Unworn 51개` → 해당 Item 목록
- `최근 반복 Outfit 4개` → 해당 Outfit 목록
- `Cardigan 12개` → Cardigan Item 목록
- `지하철 60%` → 선택 기간의 지하철 Wear Log 또는 Outfit 목록

필터된 결과가 0개면 정상 빈 상태와 적용 중인 기준을 함께 표시한다.

### 5.3 저장값과 계산값

- Wear Log, Item 상태, category, place, transport, Replacement Line relation은 저장값이다.
- 착용 횟수, 마지막 착용일, 활용률, 최근 반복, 장기 미착용은 계산값이다.
- 화면에는 계산 기준일과 기간을 표시한다.
- `착용하지 않았다`와 `기록이 없다`를 가능한 범위에서 구분한다. Wear Log가 없는 기간을 실제 미착용으로 과장하지 않는다.
- 계산 규칙은 순수 함수와 fixture로 검증하고, DB View 또는 RPC를 사용할 경우 같은 결과를 계약 테스트로 대조한다.

### 5.4 최근 반복과 장기 미착용

- 두 상태는 경고나 잘못으로 표현하지 않고 관리용 신호로 표현한다.
- `Unworn`은 전체 Wear Log 0건이라는 기존 정의를 유지한다.
- `장기 미착용`은 과거 착용은 있으나 기준일 이전 일정 기간 동안 기록이 없는 상태다.
- `최근 반복`은 선택한 최근 기간에 같은 Item 또는 Outfit이 여러 번 등장한 상태다.
- 정확한 기간과 횟수는 P4-0에서 실제 기록 분포를 보고 확정한다. 구현자가 임의의 30일·90일·1년 값을 영구 규칙으로 정하지 않는다.
- 계절 밖 Item을 장기 미착용으로 압박하지 않도록 계절 범위를 함께 적용할 수 있어야 한다.

### 5.5 Replacement Line

- 현재 relation에는 명시적 교체 순서가 없다. 연결 순서가 확인되지 않은 상태에서 화살표 계보를 추정하지 않는다.
- Core에서는 이름·Style Identity·연결 Item과 각 Item의 Active/Retired 상태를 한 그룹으로 보여준다.
- Item이 0개인 Line과 Style Identity가 없는 Line은 삭제하지 않고 확인 필요 상태로 표시한다.
- 편집 기능은 실제 사용 사례를 확인한 뒤 연다. 단순 relation 편집으로 충분한지, 교체 순서·현재 대표 Item 필드가 필요한지 먼저 결정한다.

### 5.6 세탁과 알림

- `착용했다 = 세탁했다`로 추정하지 않는다.
- 세탁 기록의 단위가 Item인지, 여러 Item을 묶은 세탁 1회인지 먼저 정한다.
- 손세탁·드라이클리닝·세탁 제외처럼 필요한 사건 종류를 실제 사례로 확인한다.
- 알림은 세탁 데이터가 신뢰할 수 있을 때만 추가한다.
- 첫 알림은 서버 Cron이나 푸시보다 앱을 열었을 때 보이는 내부 관리 신호를 우선 검토한다.
- Supabase Free Plan에서 추가 상시 작업과 egress가 필요한 구조는 비용·쿼터를 먼저 확인한다.

### 5.7 이미지와 Preview

- Phase 4 통계는 기존 Item cutout과 작은 thumbnail만 사용한다.
- 통계 구현을 이유로 Outfit Preview를 새로 일괄 생성하지 않는다.
- 목록에는 필요한 이미지만 지연 로드하고, 숫자 요약에는 이미지를 요청하지 않는다.
- 이미지가 없어도 스와치·이름·분류로 모든 통계와 관리 기능을 사용할 수 있어야 한다.

## 6. 화면 구조

### 6.1 Statistics 홈

```text
MORE → Statistics
→ 기간 선택
→ 요약
→ 보유 현황
→ 착용 분석
→ 관리 신호
→ 상황별 분석
```

첫 화면은 다음 순서를 기본으로 한다.

1. 선택 기간, Wear Log 수, 착용한 Outfit 수, 착용한 Item 수
2. `보유 현황`: 상위·세부 카테고리, Active·Retired·Unworn
3. `착용 분석`: 많이 입은 Outfit·Item, 착용 비중
4. `관리 신호`: 최근 반복, 장기 미착용
5. `상황별 분석`: 계절, 장소, 교통수단
6. `Replacement Lines` 진입

모바일에서는 모든 상세 순위를 한 번에 렌더링하지 않고 각 영역의 상위 일부와 `더 보기`를 사용한다.

### 6.2 통계 상세 목록

- Statistics에서 선택한 조건을 유지한다.
- Item 결과는 Closet 카드 또는 간결한 순위 목록을 재사용한다.
- Outfit 결과는 Lookbook 카드 또는 간결한 순위 목록을 재사용한다.
- 원본 화면의 전체 필터 상태를 덮어쓰지 않도록 통계 전용 query parameter 또는 route state를 사용한다.
- 뒤로 가면 이전 기간과 스크롤 위치를 복원한다.

### 6.3 Replacement Lines

```text
MORE → Statistics → Replacement Lines
→ Line 목록
→ 이름·Style Identity·연결 Item 수 확인
→ Line 상세
→ 연결 Item의 이미지·이름·카테고리·Active/Retired 확인
```

Core에서는 읽기 전용임을 명확히 표시한다. 관계 순서가 없으면 `과거 → 현재`처럼 보이는 시각 표현을 사용하지 않는다.

### 6.4 조건부 관리 화면

Replacement Line 편집이나 세탁 기록을 열 경우 Statistics에 억지로 끼워 넣지 않고 More 아래 독립 관리 화면으로 분리할 수 있다. 읽기 분석과 쓰기 작업의 책임을 분리한다.

## 7. 데이터와 보안

### 7.1 Core 데이터 원본

가능한 한 기존 데이터를 사용한다.

- `closet_items`
- `closet_outfits`
- `closet_outfit_items`
- `closet_wear_logs`
- `closet_places`
- `closet_transport_modes`
- `closet_replacement_lines`
- `closet_replacement_line_items`

Core 통계만을 위해 Wear Log나 Item에 중복 집계값을 저장하지 않는다.

### 7.2 계산 위치

현재 데이터 규모에서는 먼저 기존 authenticated snapshot과 순수 계산 모듈로 정확성을 검증한다. 다음 조건이 확인될 때만 DB 집계로 옮긴다.

- 초기 로드 또는 기간 변경이 모바일에서 눈에 띄게 느리다.
- 반복 계산 때문에 동일한 대용량 row를 자주 다시 전송한다.
- egress 또는 메모리 사용이 실제 측정에서 문제가 된다.

DB View를 추가하면 PostgreSQL 15 이상에서 `security_invoker = true`를 사용하고, 기존 workspace RLS를 통과하는지 검증한다. RPC가 필요하면 회원·workspace 소유권을 함수 내부에서도 검증하고 `SECURITY DEFINER`를 권한 오류 우회용으로 사용하지 않는다.

### 7.3 Replacement Line 읽기

- 현재 SELECT policy와 Data API grant를 원격에서 읽기 전용으로 확인한다.
- repository가 현재 앱 snapshot에 Replacement Line과 relation을 포함하지 않는다면 별도 lazy query를 우선한다.
- Statistics 진입만으로 사용하지 않는 relation까지 매번 전송하지 않는다.
- Line과 Item이 같은 workspace에 속하는지 FK와 repository 경계에서 함께 검증한다.

### 7.4 조건부 쓰기 계약

Replacement Line 편집을 열 경우 다음을 지킨다.

- authenticated frontend에 필요한 최소 INSERT·UPDATE·DELETE policy만 추가한다.
- UPDATE에는 SELECT policy, `USING`, `WITH CHECK`를 모두 둔다.
- Line과 Item relation의 workspace 일치를 보장한다.
- 여러 Item relation 교체는 중간 상태가 노출되지 않도록 RPC 트랜잭션을 검토한다.
- 영구 삭제보다 보관 상태를 우선한다. 기존 schema에 보관 필드가 없다면 실제 요구를 확인한 뒤 migration으로 추가한다.
- 원격 적용 전 pgTAP, Advisor, production 전후 count 검증을 수행한다.

### 7.5 세탁 후보 모델

P4-0에서 다음 두 모델을 비교하고 하나를 선택하기 전에는 migration을 만들지 않는다.

1. Item별 사건: Item 하나에 세탁·드라이·관리 사건을 기록
2. 세탁 묶음 + Item relation: 한 번의 세탁에 여러 Item을 연결

선택 기준은 실제 입력 수고, 같은 날 여러 Item 처리, 부분 세탁, 기록 수정, 통계 요구다. 어떤 모델이든 Wear Log를 변경하지 않고 별도 원본 사건으로 저장한다.

## 8. 구현 단계

### P4-0. 사용 규칙과 원격 기준선 확인

목표: 후보 기능을 실제 데이터와 사용 습관에 맞게 줄이고, 원격 상태를 변경 없이 확인한다.

작업:

- [ ] production의 Item·Outfit·Wear Log·Place·Transport·Replacement Line 수량 재확인
- [ ] Replacement Line 53개와 relation 165개가 현재도 일치하는지 확인
- [ ] Item 없는 Line, Style Identity 없는 Line, 고아 relation 확인
- [ ] Wear Log 날짜 분포와 계절·장소·교통수단 값의 실제 사용률 확인
- [ ] 최근 반복과 장기 미착용 후보 기간별 결과 수를 읽기 전용으로 비교
- [ ] Statistics에서 가장 먼저 보고 싶은 기간·지표를 J와 확정
- [ ] Replacement Line 실제 사례 3~5개를 보고 관계 순서가 필요한지 판단
- [ ] 세탁 기록이 필요한 실제 입력 사례와 최소 단위를 확인
- [ ] Supabase changelog·현재 CLI·Data API·RLS·Advisor 기준 확인

완료 조건:

- [ ] Core 지표 정의와 필터 기준이 문서화된다.
- [ ] 임의의 미착용·반복 기준이 코드에 들어가지 않는다.
- [ ] 조건부 기능별 착수/보류 결정이 기록된다.
- [ ] production 데이터는 변경되지 않는다.

### P4-1. 통계 계산 계약

목표: UI와 무관한 계산 규칙을 먼저 고정한다.

작업:

- [ ] 기간 경계와 기준일을 받는 통계 query model 정의
- [ ] 상위·세부 카테고리 집계 모듈 확장
- [ ] 전체 보유·Active·Retired·Unworn 계산
- [ ] 기간 내 Outfit·Item 착용 횟수와 비중 계산
- [ ] 최근 반복·장기 미착용 판정 함수 구현
- [ ] 장소·교통수단·계절 집계 구현
- [ ] 같은 날짜의 여러 Wear Log와 같은 Outfit 반복 기록 보존
- [ ] 독립 Innerwear와 Socks 집계 회귀 테스트
- [ ] 전체 기간과 선택 기간이 섞이지 않는 fixture 검증

완료 조건:

- [ ] 현재 기본 Statistics 결과와 새 계산의 공통 지표가 일치한다.
- [ ] 날짜 경계·Retired·Unworn·누락 relation 사례가 테스트된다.
- [ ] 모든 계산값의 입력 원본과 기준이 코드에서 추적 가능하다.

### P4-2. Statistics 정보 구조와 상세 탐색

목표: 숫자를 빠르게 읽고 실제 Item·Outfit으로 이동할 수 있게 한다.

작업:

- [ ] Statistics 기간 선택과 요약 영역 구현
- [ ] 상위·세부 카테고리 보유 현황 구현
- [ ] Outfit·Item 착용 분석 구현
- [ ] 관리 신호 영역 구현
- [ ] 계절·장소·교통수단 분석 구현
- [ ] 각 결과의 상세 목록 또는 원본 상세 연결
- [ ] `더 보기` 점진 렌더링 적용
- [ ] 로딩·빈 상태·오류·재시도 구현
- [ ] 모바일 스크롤 복원과 PC 레이아웃 검증

완료 조건:

- [ ] J가 세부 카테고리 보유 수를 Statistics에서 확인할 수 있다.
- [ ] 통계 숫자를 눌러 그 숫자를 만든 실제 항목을 확인할 수 있다.
- [ ] 작은 화면에서 전체 순위가 한꺼번에 렌더링되지 않는다.

### P4-3. 관리 신호 실사용 조정

목표: 장기 미착용과 최근 반복이 과도한 경고 없이 유용한지 확인한다.

작업:

- [ ] 계절 범위를 적용한 장기 미착용 결과 확인
- [ ] Item 반복과 Outfit 반복을 구분
- [ ] Unworn과 장기 미착용을 구분해 표시
- [ ] 통계 기준일·기간·판정 이유 표시
- [ ] 실제 데이터에서 오탐 사례 기록
- [ ] 필요하면 기준을 설정에서 조정할지 결정

완료 조건:

- [ ] 서로 다른 세 상태를 혼동하지 않는다: 미착용, 오래 안 입음, 최근 반복.
- [ ] 계절이 맞지 않는다는 이유만으로 관리 대상으로 과도하게 표시하지 않는다.
- [ ] 결과에서 Item·Outfit 상세로 이동할 수 있다.

### P4-4. Replacement Line 읽기 전용 UI

목표: 이미 보존된 교체 데이터를 앱에서 안전하게 이해할 수 있게 한다.

작업:

- [ ] TypeScript model과 lazy repository query 추가
- [ ] Line 목록·검색·빈 상태 구현
- [ ] Line 상세와 연결 Item 카드 구현
- [ ] Active·Retired·누락 상태 표시
- [ ] Style Identity와 relation 품질 경고 표시
- [ ] relation 순서가 없는 데이터에 계보 방향을 추정하지 않는 테스트
- [ ] authenticated workspace 외 데이터 비노출 검증

완료 조건:

- [ ] 기존 Line과 relation 수량이 원격 기준선과 일치한다.
- [ ] Item 0개와 Style Identity 누락 Line도 숨기거나 삭제하지 않는다.
- [ ] 읽기 전용 UI가 Item·Outfit 기존 흐름을 변경하지 않는다.

### P4-5. Replacement Line 편집 — 조건부

착수 조건:

- [ ] J가 앱에서 Line을 실제로 새로 만들거나 수정할 필요가 있다.
- [ ] 연결 순서와 현재 대표 Item의 의미가 확정됐다.
- [ ] 읽기 전용 UI에서 원본 관계가 충분히 검증됐다.

작업 후보:

- [ ] schema 보완과 migration
- [ ] RLS·grant·원자적 쓰기 RPC
- [ ] 생성·이름 수정·Item 연결·보관 UI
- [ ] 중복 relation·다른 workspace Item 차단
- [ ] pgTAP·Advisor·원격 count 검증

### P4-6. 세탁 기록과 앱 내부 알림 — 조건부

착수 조건:

- [ ] 세탁 기록의 원본 단위가 확정됐다.
- [ ] J가 실제로 계속 입력할 수 있는 최소 흐름이 정해졌다.
- [ ] 알림 기준이 Wear Log 추정이 아니라 세탁 원본에서 계산 가능하다.

작업 후보:

- [ ] 세탁 사건 schema·RLS·repository
- [ ] Item 상세 또는 전용 빠른 기록 UI
- [ ] 최근 세탁일·착용 후 미세탁 횟수 계산
- [ ] 앱 내부 관리 배지
- [ ] 수정·취소·중복 제출 복구

브라우저 푸시·위젯·Cron은 이 단계의 실사용 후 별도 결정한다.

### P4-7. 통합 검증과 공개 배포

작업:

- [ ] TypeScript 검사, 전체 Vitest, production build
- [ ] 통계 계산 fixture와 현재 production 표본 대조
- [ ] PC와 iPhone 크기에서 Statistics·상세·Replacement Line QA
- [ ] 키보드 탐색, focus, label, 숫자만으로 의미를 전달하지 않는지 확인
- [ ] 초기 데이터 요청량·이미지 요청량·렌더 시간을 전후 비교
- [ ] schema 변경이 있으면 GitHub Actions 격리 pgTAP 실행
- [ ] production 적용 전 migration·RLS·grant·Advisor 재검토
- [ ] production 적용 후 count·정합성·인증 경로 확인
- [ ] GitHub Pages 배포와 실제 공개 자산 확인

완료 조건:

- [ ] 통계 수치가 원본 Wear Log와 표본 및 전체 집계에서 일치한다.
- [ ] 다른 workspace의 데이터가 보이지 않는다.
- [ ] 통계 페이지가 불필요한 Preview 일괄 요청을 만들지 않는다.
- [ ] 기존 추천·Closet·Lookbook·Calendar·착용 기록 회귀가 없다.

## 9. 테스트 기준

### 9.1 계산

- 기간 시작일·종료일 포함 여부
- 같은 날짜의 같은 Outfit 복수 기록
- Item이 여러 Outfit에 포함된 경우 Item 착용 횟수
- Retired Item과 archived/Error Outfit의 과거 기록 보존
- Wear Log 0건인 Unworn과 과거 기록이 있는 장기 미착용 구분
- 계절 판단에서 제외되는 Shoes·Bag·Acc 처리
- Socks의 Acc 상위 집계와 Socks 세부 집계
- 독립 Innerwear의 Statistics 전용 집계
- Place·Transport null과 실제 값 구분

### 9.2 UI

- 기간·계절·상태 필터 조합
- 통계 숫자와 상세 결과 수 일치
- 더 보기 단위와 초기화
- 뒤로 가기 시 필터·스크롤 복원
- 빈 결과, 부분 데이터, 오류 후 재시도
- 긴 Item·Outfit·Replacement Line 이름
- 390px 모바일에서 가로 overflow 없음
- PC에서 읽기 폭과 상세 탐색 유지

### 9.3 데이터·보안

- 비회원 거절
- 다른 workspace row 거절
- read-only 단계에서 frontend write 불가
- UPDATE를 열 경우 SELECT·USING·WITH CHECK 동작
- Line과 Item workspace 불일치 차단
- View 사용 시 `security_invoker`와 RLS 적용
- RPC 사용 시 membership과 grant 범위
- migration 재실행 안전성, FK, index, Advisor

## 10. 위험과 대응

| 위험 | 대응 |
|---|---|
| 숫자는 많지만 실제 판단에 도움이 되지 않음 | 각 지표를 상세 목록과 행동으로 연결하고 Core 실사용 후 확장 |
| 임의의 미착용 기간이 죄책감만 유발 | P4-0에서 실제 분포로 기준을 정하고 중립적인 관리 신호로 표현 |
| 계절 밖 옷이 장기 미착용으로 과다 표시 | 계절 범위 필터와 판정 이유 제공 |
| 기존 category를 UI 편의를 위해 덮어씀 | 저장값 유지, 상위 그룹은 표시 계산으로만 사용 |
| Replacement Line 순서를 잘못 추정 | Core에서는 무방향 그룹으로 표시하고 명시적 순서가 필요할 때 schema 결정 |
| Statistics 진입 때 전체 이미지·relation을 과다 요청 | 숫자 우선, 이미지 lazy load, Replacement Line lazy query |
| frontend 집계가 느리거나 egress 증가 | 실제 측정 후 security-invoker View/RPC로 필요한 집계만 이전 |
| View 또는 RPC가 RLS를 우회 | workspace 소유권 계약, pgTAP, Advisor, production 인증 검증 |
| 세탁 입력이 번거로워 사용하지 않음 | migration 전에 실제 최소 입력 흐름을 확인하고 조건부 착수 |
| 알림·Cron이 Free Plan 비용과 복잡도를 키움 | 앱 내부 계산 신호를 우선하고 외부 자동화는 사용 가치 확인 후 결정 |

## 11. 완료 정의

### Phase 4 Core 완료

- [ ] 기존 세부 카테고리를 Statistics에서 상위 그룹과 함께 확인할 수 있다.
- [ ] 기간별 Outfit·Item 착용과 장소·교통수단·계절 분포를 확인할 수 있다.
- [ ] Unworn·장기 미착용·최근 반복의 차이를 이해할 수 있다.
- [ ] 모든 주요 숫자에서 관련 Item·Outfit 원본을 확인할 수 있다.
- [ ] Replacement Line을 읽기 전용으로 확인하고 누락 상태를 찾을 수 있다.
- [ ] 통계가 이미지나 Preview 준비 상태와 무관하게 동작한다.
- [ ] 계산 결과가 production 원본 표본과 전체 집계에서 일치한다.
- [ ] 모바일 성능·접근성·RLS 검증을 통과한다.
- [ ] 기존 추천·기록·탐색 흐름에 회귀가 없다.

### 조건부 확장 완료

Replacement Line 편집, 세탁, 알림, 오프라인은 각각 착수 조건을 충족하고 별도 완료 기준을 통과했을 때만 Phase 4 결과에 추가한다. 구현하지 않기로 결정한 후보는 `미완료`가 아니라 근거가 기록된 `보류`로 남긴다.

## 12. P4-0에서 J와 확인할 값

다음 값은 실제 분포와 사용 사례를 본 뒤 확정한다.

1. Statistics의 기본 기간: 전체, 최근 1년, 올해 중 무엇을 먼저 보여줄지
2. 장기 미착용의 기간과 계절 범위 적용 방식
3. 최근 반복의 기간·횟수와 Item/Outfit 중 우선 단위
4. 장소·교통수단·계절 통계에서 실제로 보고 싶은 질문
5. Replacement Line에서 `현재 대표`, `이전 순서`가 필요한지
6. Replacement Line을 앱에서 직접 편집할 필요가 있는지
7. 세탁 기록을 실제로 남길 의향과 가장 짧은 입력 흐름
8. 앱 내부 관리 신호만으로 충분한지, 알림이 실제로 필요한지

P4-0에서는 위 값을 질문만으로 정하지 않고 production 데이터를 읽기 전용으로 집계한 후보 결과와 함께 결정한다.
