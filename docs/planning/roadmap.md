# Closet Index Roadmap

- 최종 수정일: 2026-08-06
- 문서 상태: 기준 문서
- 현재 위치: Phase 6 로컬 구현 완료, P6-2·P6-4 격리 DB 계약 37개 통과 및 production 적용 전
- 관련 문서: [Product Plan](./product-plan.md), [Phase 1 MVP Spec](./phase-1-mvp-spec.md), [Implementation Status](./phase-1-implementation-status.md), [Phase 2 Weather Plan](./phase-2-weather-plan.md), [Phase 3 Visual Wardrobe Plan](./phase-3-visual-wardrobe-plan.md), [Phase 3.5 Calendar & Navigation Upgrade](<./Phase 3.5 — Calendar & Navigation Upgrade.md>)

## 이 문서의 목적

이 문서는 Closet Index가 현재 어느 단계에 있고, 각 단계가 무엇을 완성해야 끝나는지 빠르게 확인하기 위한 요약 Roadmap이다.

구체적인 제품 규칙과 전체 범위는 Product Plan이 소유하고, 실제 테이블·화면·동작·테스트는 `phase-1-mvp-spec.md`가 소유한다.

## 용어

- **MVP**: 앱의 핵심 가치가 실제 사용에서 검증되는 최소 기능 범위
- **Phase 1**: MVP를 구현하고 검증하는 작업 단계
- **Technical Alpha**: 데이터와 계산의 정확성을 먼저 검증하는 내부 단계
- **Visual MVP**: 이미지 기반 탐색을 포함하여 핵심 사용 경험을 검증하는 단계
- **v1.0**: Phase 1의 Technical Alpha와 Visual MVP가 모두 통과한 첫 안정 릴리스

MVP는 기능의 범위이고, Phase는 작업 순서이며, v1.0은 검증을 마친 릴리스 상태다.

## 현재까지 확정된 방향

- 앱의 핵심은 AI가 새 코디를 만드는 것이 아니라, 과거에 실제로 검증한 착장을 오늘 조건에 맞춰 다시 찾는 것이다.
- 첫 핵심 흐름은 `조건 입력 → 착장 탐색 → 선택 → 착용 기록 → 통계 반영`이다.
- Supabase 이전을 검증한 뒤 Supabase를 새 원본으로 사용하고, Notion은 읽기 전용 보관본으로 유지한다.
- 착장은 고정된 아이템 조합이다. 아이템 하나가 달라도 별도의 착장으로 취급한다.
- 착장명은 선택 정보이며 고유값이 아니다. 데이터 연결은 UUID와 relation으로 처리한다.
- 추천은 평균 온도로 순위를 정하고 출발·귀가 온도로 위험을 경고한다.
- 한 번 `OK`였던 온도에는 기본적으로 ±2°C 허용 범위를 둔다.
- 비 적합성은 모든 Item, 장거리 걷기는 신발을 기본 가능으로 보며 불가 예외만 점진적으로 태깅한다.
- 실제 옷 사진과 착장 콜라주 원본은 없지만, Notion 커스텀 아이콘에는 아이템 식별에 유용한 색상 정보가 있다.
- Notion 아이콘은 이전 시 HEX 팔레트로 변환하고, 앱은 별도 이미지 요청 없이 CSS 색상 스와치로 표시한다.
- 앱 UI는 흰색·회색·검은색 중심으로 유지하고, 옷 이미지와 색상 스와치만 데이터 색상을 사용한다.
- 전체 이미지 준비가 개발을 막지 않도록 현재 계절의 대표 착장부터 실제 옷 이미지를 적용한다.
- 개인용 앱이며 Google 로그인으로 J의 계정만 허용한다.
- Item 통계는 전체 Outfit 순위나 장소·교통수단 자체의 통계를 늘리기보다 실제 착용 Item과 월별 착용 분포를 보여주는 데 집중한다.
- 독립 `Innerwear`는 Outfit 착용 통계에서 제외하고 구매·교체 주기로 관리하며, `Top-T-shirts-innerwear`는 착장에 포함되는 Top으로 집계한다.
- Notion의 `Replaces` 98개 relation entry는 49개의 상호 대칭 무방향 연결이다. 구매일로 방향을 추정하지 않고 검토 후 계보 방향을 확정한다.
- 추천 알고리즘은 통계와 분리해 Phase 5에서 다루고, 세탁·교체·재구매 주기 관리는 Phase 6에서 다룬다.

## 전체 단계

| 단계 | 목표 | 주요 결과물 | 완료 조건 |
|---|---|---|---|
| Phase 0 | 제품 규칙과 범위 확정 | Roadmap, Product Plan, Notion 조사 결과 | Phase 1에서 임의로 결정하면 안 되는 규칙이 문서화됨 |
| Phase 1A | 데이터·계산 Technical Alpha | Supabase 기반, 데이터 이전, 수동 추천, 착용 기록 | Notion 원본과 relation·통계·추천 근거가 일치함 |
| Phase 1B | Visual MVP 및 v1.0 | 대표 착장 이미지, 고정 슬롯 카드, 모바일 실사용 | 핵심 흐름을 실제 생활에서 반복 사용 가능함 |
| Phase 2 | 날씨 자동화 | 출발·귀가 시각 기반 예보, 평균 온도와 경고 | 수동 온도 계산 없이 신뢰할 수 있는 후보가 나옴 |
| Phase 3 | 시각 옷장 확장 | 이미지 범위 확대, 코디 만들기, 미리보기 생성 | 새 아이템과 새 착장을 앱 안에서 관리 가능함 |
| Phase 3.5 | Calendar·내비게이션 개선 | 월요일 시작 월간 착장 달력, 전면 메뉴 재배치 | 한 달 착장을 한 화면에서 보고 기존 착장으로 바로 이동할 수 있음 |
| Phase 4 | 각종 통계·Replacement Line | Item 활용률, 월별 실제 착용 분포, Replacement Lineage | 실제 착용 패턴과 대체 계보를 앱에서 확인·정리할 수 있음 |
| Phase 5 | 추천 알고리즘 | 기존 맥락 순위, 장소 HVAC Profile, Item 체감 관측 | 과거에 검증한 착장을 현재 장소·온도 맥락에 맞게 더 잘 고름 |
| Phase 6 | Care & Replenishment | Item 상세 계보, 재구매·수량, 점검, 손세탁·드라이클리닝 | 네 관리 신호를 공통 계산과 원본 사건으로 일관되게 운영함 |

## Phase 0 — Discovery & Product Rules

### 목표

현재 Notion과 실제 사용 습관에 숨어 있는 제품 규칙을 꺼내고, 구현 전에 AI가 임의로 채울 빈칸을 줄인다.

### 완료된 작업

- 과거 옷장 앱과 현재 Notion 사용 경험 비교
- 아이디어 메모와 학습 기록 검토
- Wardobe, Outfits, Daily Log, Replacement Line 구조 조사
- 주요 데이터 규모와 relation 품질 확인
- 출발·귀가 온도 공백의 실제 의미 확인
- 착장 동일성, Error 처리, 이미지 부재, 비 조건의 제품 규칙 확정
- Notion 색상 아이콘을 HEX 팔레트로 이전하는 방향 확정
- 과거 앱을 기준으로 한 무채색 UI와 5개 하단 내비게이션 확정
- Phase 1A와 Phase 1B의 화면 목록 확정
- Roadmap과 Product Plan 작성
- `phase-1-mvp-spec.md` 화면·UI 기준 작성
- Phase 1 최종 schema·RLS·추천 규칙·수용 기준 확정
- Notion 이전 도구와 재실행 원칙 확정

### Phase 1로 이관한 작업

- custom emoji별 실제 HEX 확정
- 공용 `mworkroom`의 Closet Index workspace에서 schema·RLS 검증
- Phase 1B Storage와 이미지 slot 규칙

### 종료 조건

Phase 1 구현자가 추가 제품 결정을 내리지 않고 명세에 따라 작업을 시작할 수 있어야 한다.

## Phase 1A — Technical Alpha

### 목표

이미지 작업과 날씨 API에 앞서, 데이터 이전과 추천 계산이 실제 Notion 결과를 정확히 재현하는지 검증한다.

### 주요 범위

- React, Vite, TypeScript 기반 모바일 우선 PWA
- Supabase Database와 Auth 기반
- Google 로그인 및 단일 사용자 접근 제어
- Wardobe 아이템, Outfits, Outfit relation, Outfits 유형 Daily Log 이전
- Replacement Line 데이터 이전 및 UI 비노출
- Notion 페이지 ID 보존
- 수동 출발 온도와 선택적 귀가 온도 입력
- 평균 온도 기반 추천 순위와 출발·귀가 위험 경고
- Home의 `오늘 뭐 입지?`, Closet, Lookbook, Favorite, More 중심의 모바일 화면 구조
- 착장·아이템 상세, 착용 기록, Calendar, 기본 통계
- Notion 아이콘에서 이전한 HEX 색상 스와치와 아이템 목록 fallback

### 완료 조건

- 원본 항목 수와 relation 수가 이전 검증 기준과 일치한다.
- `Temp Back` 공백이 출발 온도와 동일한 값으로 올바르게 복원된다.
- 같은 이름의 서로 다른 착장이 병합되지 않는다.
- Notion의 착용 횟수와 마지막 착용일을 표본 및 전체 집계에서 재현한다.
- 추천 결과가 근거와 함께 설명된다.
- Notion이나 Supabase 중 어느 쪽이 원본인지 혼동되는 쓰기 흐름이 없다.

## Phase 1B — Visual MVP / v1.0

### 목표

기술적으로 맞는 앱을 실제로 빠르게 훑어보고 고를 수 있는 옷장 앱으로 만든다.

### 주요 범위

- 현재 계절의 대표 착장 20~30개 선정
- 대표 착장에 필요한 아이템 누끼 이미지 제작 및 업로드
- 카테고리별 고정 슬롯과 기본 크기·겹침 순서
- 이미지 합성 착장 카드
- Phase 1A와 동일한 화면 구조 위의 이미지 기반 Home·Closet·Lookbook 탐색
- 추천 후보 선택과 착용 기록의 반복 실사용
- 이미지 없는 나머지 데이터의 정상적인 fallback

### 완료 조건

- 흔히 사용하는 온도대에서 여러 개의 시각적 후보를 비교할 수 있다.
- 이미지가 있는 착장과 없는 착장이 모두 깨지지 않고 표시된다.
- 추천 근거와 경고를 이해하고 착장을 선택할 수 있다.
- 선택한 착장이 착용 기록과 통계에 정확히 반영된다.
- 실사용 중 핵심 흐름을 막는 데이터·레이아웃·조작 문제가 없다.
- 이전 검증과 실사용 검증이 끝난 뒤 Supabase를 원본으로 전환한다.

## Phase 2 — Weather Automation

- 상세 실행 계획: [Phase 2 Weather Automation Plan](./phase-2-weather-plan.md)

### 목표

J가 직접 온도를 확인하고 평균을 계산하던 과정을 자동화한다.

### 주요 범위

- 출발 시각과 귀가 시각 입력
- 기상청 시간대별 예보 조회
- 출발·귀가 온도와 평균 추천 온도 계산
- 평균 온도 기반 정렬과 양 끝 온도 경고
- 비·눈·습도 등 날씨 조건 연결
- 예보 결과의 수동 수정 또는 override

### 완료 조건

- 수동 온도 입력 없이도 기존 수동 추천과 납득 가능한 수준으로 일치한다.
- 겨울처럼 온도 차가 큰 날에는 평균값만으로 위험을 숨기지 않는다.
- API 실패나 예보 없음 상태에서도 수동 입력으로 계속 사용할 수 있다.

## Phase 3 — Visual Wardrobe Expansion

- 상세 실행 계획: [Phase 3 Visual Wardrobe Expansion Plan](./phase-3-visual-wardrobe-plan.md)

### 목표

대표 착장에 한정된 시각 경험을 전체 옷장과 새 착장 생성 흐름으로 확장한다.

### 주요 범위

- 누끼 이미지 적용 범위 점진적 확대
- 아이템 이미지 등록·교체
- 고정 슬롯 기반 코디 만들기
- 기존 착장 복제 후 새 착장 생성
- 간단한 위치·크기 조정
- 착장 미리보기 생성 및 캐시

### 완료 조건

- 새 옷을 등록하고 기존 아이템과 조합하여 새 착장을 만들 수 있다.
- 기존 착장은 수정되지 않고 복제를 통해 새 고정 조합으로 저장된다.
- 이미지와 relation이 어긋났을 때 찾고 복구할 수 있다.

## Phase 3.5 — Calendar & Navigation Upgrade

- 상세 실행 계획: [Phase 3.5 Calendar & Navigation Upgrade](<./Phase 3.5 — Calendar & Navigation Upgrade.md>)

### 목표

Phase 4에 들어가기 전에 자주 쓰는 Calendar를 전면 메뉴로 옮기고, 이번 달에 입은 착장을 한눈에 확인하는 월간 화면으로 완성한다.

### 주요 범위

- 하단 탭을 `Home → Calendar → Closet → Lookbook → More`로 재배치
- Favorite를 More 첫 항목으로 이동
- 월요일 시작의 5주·6주 월간 착장 달력
- Calendar chrome과 접근성 이름을 영어로 통일
- 단일 착장 직접 상세 이동과 복수 착장 선택 시트
- Wear Log 수정·삭제 진입점을 Outfit 상세 이력으로 이동

### 완료 조건

- 5주·6주 달력이 하단 메뉴 위의 높이를 사용하고 모바일에서 겹치지 않는다.
- 날짜별 착장 유무와 복수 기록을 한 화면에서 구분할 수 있다.
- 단일 기록은 기존 Outfit 상세로 바로 이동하고 복수 기록은 선택 후 이동한다.
- 기존 Wear Log, 통계, URL, Supabase 데이터 계약이 유지된다.

## Phase 4 — Statistics & Replacement Lineage

- 상세 실행 계획: [Phase 4 Statistics & Replacement Lineage Plan](./phase-4-maintenance-insights-plan.md)

### 목표

실제 Wear Log로 현재 옷의 활용도와 월별 착용 패턴을 확인하고, Notion에서 보존한 Replacement Line을 방향이 확인된 계보로 정리한다.

### 주요 범위

- 현재 Active Item의 기간별 활용률
- Most Worn, Never Worn, 선택 연도 미착용 Item
- 카테고리·계절 필터와 실제 Item 목록 연결
- 전체 Wear Log를 월 기준으로 합산한 Item별 1~12월 실제 착용 분포
- 1~12월을 한 줄에 배치하는 저높이 세로 막대 그래프
- 53개 Replacement Line과 165개 membership 현황
- 49개 무방향 Legacy Link의 방향 검토
- 확인된 parent·child, 시작점, 가지 이름, 선택 이유 편집
- 순환을 막는 DAG 저장과 Line 병합·보관·대표 Line 관리

전체 Outfit 순위, 장소·교통수단 독립 통계, 임의의 장기 미착용·최근 반복 임계값은 Phase 4 핵심 범위에 넣지 않는다. 장소와 교통수단은 Phase 5 추천 근거로 사용하고, 세탁과 재구매 주기는 Phase 6에서 분리한다.

## Phase 5 — Recommendation Intelligence

- 초기 실행 계획: [Phase 5 Recommendation Intelligence Initial Plan](./phase-5-recommendation-intelligence-plan.md)

### 목표

과거에 실제로 입고 평가한 Outfit을 현재 온도·장소·이동 맥락에 맞게 다시 찾는 기존 추천 원칙을 확장한다.

### 주요 범위

- 같은 Outfit·장소·교통수단 조합의 반복 착용을 이용한 기존 맥락 순위
- 같은 Outfit·장소 반복을 이용한 보조 근거
- 특정 장소와 일반 장소 유형을 구분한 Place Profile
- 예상 HVAC와 Wear Log의 당일 실제 HVAC 관측 분리
- 직접 입력한 Item 체감과 Outfit에서 파생한 간접 근거의 provenance 구분
- 기존 평균 온도 정렬과 출발·귀가 endpoint 경고 유지
- 보완 Item이 실제로 추가되면 기존 Outfit을 바꾸지 않고 새 Outfit으로 검증

### 완료 조건

- 추천 결과가 장소·교통수단 자체의 통계가 아니라 구체적인 과거 착용 근거로 설명된다.
- 수동 장소 Profile과 당일 실제 관측이 섞이지 않는다.
- 기존 Outfit의 고정 Item 구성이 추천 학습 때문에 변경되지 않는다.

## Phase 6 — Care & Replenishment

[Phase 6 Care & Replenishment Plan](./phase-6-care-replenishment-plan.md)

### 목표

Item 상세 페이지에서 교체 계보를 확인하고, 구매·착용·관리 사건을 바탕으로 재구매, 장기 미착용 점검, 손세탁·드라이클리닝 필요 시점을 관리한다.

### 주요 범위

- Item 상세의 직접 부모 → 본인 → 직접 자식 Replacement Line
- 재구매 날짜·구매 수량·현재 보유 수량 기록과 최근 구매 기준 교체 계산
- 착용 기록 없음과 2년 이상 미착용을 통합한 `점검` 신호
- Category 규칙과 최근 관리 이후 착용 횟수를 사용한 손세탁·드라이클리닝 관리
- Item 목록의 우선순위 배지 1개와 Item 상세의 전체 배지
- More → Maintenance의 점검·교체·손세탁·드라이클리닝 목록

### 완료 조건

- 교체 계보, 구매 사건, Wear Log, 관리 사건이 각자의 원본을 유지한다.
- Item 목록, Item 상세, Maintenance 페이지가 같은 공통 계산으로 동일한 신호와 근거를 보여준다.
- Outfit에 들어가지 않는 `Innerwear`도 구매일 기준으로 교체 주기를 관리할 수 있다.
- 운영체제 알림 없이 Maintenance 페이지에서 필요한 Item을 네 영역으로 한눈에 확인할 수 있다.

## 지금 다음으로 할 일

1. [로컬 완료] Phase 6 P6-1·P6-1.1·P6-2·P6-3·P6-4 구현과 앱 회귀 검증
2. [완료] 격리 GitHub Actions에서 P6-2·P6-4 migration과 37개 pgTAP 계약 검증
3. [완료] production project와 migration 상태를 읽기 전용으로 재확인
4. 별도 승인 후 production migration 적용·배포·실환경 검증 여부 결정
5. Phase 6 완료 상태를 기록한 뒤 다음 제품 단계의 범위와 상세 계획 확정
