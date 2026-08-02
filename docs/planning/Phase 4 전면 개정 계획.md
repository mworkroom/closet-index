# Phase 4 전면 개정 계획

## Summary

기존 [Phase 4 계획](C:/Users/Marion/Documents/Projects/closet-index/docs/planning/phase-4-maintenance-insights-plan.md)을 같은 파일에서 전면 개정하고 [Roadmap](C:/Users/Marion/Documents/Projects/closet-index/docs/planning/roadmap.md)을 맞춘다.

Phase 4의 확정 범위는 다음 세 단계이며 각각 독립적으로 검증·배포한다.

1. P4-1 Item Statistics
2. P4-2 Replacement Lineage
3. P4-3 HOME Context Intelligence

별도 Outfit·장소·교통수단 통계는 제거한다. 세탁·알림·오프라인·추가 Maintenance 신호는 Phase 4 완료 조건에서 제외하고 후속 Backlog로 이동한다. Calendar/Favorite 내비게이션 재배치는 별도 작업으로 유지한다.

## P4-0 — 구현 전 기준선

- Supabase의 Item·Outfit·Wear Log·Replacement Line 수량, 관계, RLS를 읽기 전용으로 재확인한다.
- 현재 Notion의 53개 Line·165개 Item 연결·98개 Replaces 관계를 일회성 이주 원본으로 사용한다.
- Notion→Supabase UUID 매핑과 미해결 관계를 보고서로 만든 뒤 원격 쓰기 전에 승인을 받는다.
- 계획 문서 개정 시 같은 날짜의 한국어 devlog에 변경 이유와 단계 재구성 결정을 기록한다.

## P4-1 — Item Statistics

- 통계 범위는 `연도 + Item 계절 태그 복수 선택`이다. 날짜를 봄·여름으로 나누지 않는다.
- 첫 진입 시 Settings의 현재 옷장 범위를 복사하지만 이후 Statistics 선택은 Closet/HOME과 독립적으로 유지한다.
- 현재 연도는 오늘까지, 과거 연도는 해당 연도 전체 Wear Log를 집계한다.
- 관리 대상은 Active Outer·Top·Bottom·Dress·Shoes·Bags 및 `-made` 카테고리다. Socks·Innerwear·일반 Acc는 제외하고 계절 미지정 Item은 `전체 계절`에서만 포함한다.
- 사용률 분모는 현재 Active이며 선택 연도 말까지 구매된 대상 Item이다. Retired는 과거 Most Worn 기록에만 포함한다.
- 화면 순서는 사용률 요약 → Most Worn → Never Worn → `선택 연도·계절 옷장 미착용` → 카테고리 보유 현황이다.
- Never Worn은 전 기간 0회, 연도 미착용은 과거 착용은 있으나 선택 연도 0회로 서로 겹치지 않게 한다.
- 각 목록은 동일 크기 행으로 4개만 미리 보여주고 전체 보기는 필터된 Closet으로 이동한다. 뒤로 가기 시 필터와 스크롤을 복원한다.
- Item 상세에는 실제 착용 월을 보여주는 12개월 히트맵을 추가하되 통계 필터에는 사용하지 않는다.
- 기존 전체 Outfit 순위는 Statistics에서 제거한다.

## P4-2 — Replacement Lineage

- `Style Identity → Replacement Line → Item 계보` 구조를 유지한다.
- 현재 Notion Replaces 관계를 미확정 초안으로 seed하며 자동 승인하거나 구매일로 관계를 추론하지 않는다.
- 계보는 여러 시작점·여러 자식·여러 동등한 predecessor를 허용하는 DAG다. 순환만 금지한다.
- Line membership에는 대표 Line 여부, `시작점/후속/미지정`, 가지명 override, 자식 Item 단위 선택 이유를 저장한다.
- 별도 edge 테이블에 Line별 predecessor→successor 관계를 저장한다.
- Line에는 `needs_review/confirmed`, 검토 시각, 변경 시각, 보관 시각을 추가한다.
- 가지명은 시작 Item에서 단일 경로로 상속한다. 다른 가지가 합류하고 새 이름이 없으면 `합류` 배지를 표시한다.
- 기존 관계·멤버십·Line 속성은 한 Line 단위 RPC로 원자 저장한다. 모든 Item이 시작점 또는 predecessor를 가져야만 확정할 수 있다.
- 검토 목록은 문제 상태 우선, 그다음 Item 수가 많은 순으로 정렬한다. 진행률을 표시하고 확정 후 다음 확인 대상이 자동으로 열린다.
- 편집은 Item 카드에서 `이전 Item 선택`을 열어 동일 크기 썸네일을 복수 선택하는 방식으로 한다. 모든 세대의 썸네일 크기는 같다.
- 단일 Item Line은 명시적으로 유지할 수 있다. 빈 Line은 Item 추가·병합·보관 중 하나를 완료해야 한다.
- 복수 Line 소속을 허용하되 대표 Line 하나를 지정한다.
- Line 병합은 대상 Line의 이름·Style Identity를 유지하고 소스 Line을 보관한 뒤 전체를 다시 확인 필요 상태로 만든다.
- 후손이 있는 Item은 후손 관계를 재배정하기 전에는 Line에서 제거할 수 없다.
- 확정 Line의 멤버·관계를 변경하면 다시 `needs_review`로 전환한다.

## P4-3 — HOME Context Intelligence

- Wear Log에 실내 상태 `냉방/난방/미가동/모름`과 선택적 강도 `약함/보통/강함`을 추가한다.
- Item별 체감 관측에는 대상 Item, `추움/OK/더움`, 발생 맥락 `장소 안/이동·밖/모름`, 추천 영향 `주의만/후순위`, 메모를 저장한다.
- 기본 Wear Log 입력은 유지하고 `아이템 체감 테스트`를 열었을 때만 추가 입력한다. 영향 미선택 불편 기록은 `후순위`가 기본이다.
- 계획한 보완 아이템과 실제로 함께 입고 OK가 검증된 보완 조합을 구분한다. 검증된 조합만 경고를 해제한다.
- 과거 메모의 부위·추위·더위·냉난방 표현을 후보로 제안하되 NLP 결과를 자동 저장하지 않는다.
- 외출 온도는 출발·귀가의 구간으로 보존하며 두 구간 사이 거리가 2°C 이내일 때 유사 근거로 본다.
- 장소 안 관측은 같은 장소·냉난방 조건에서만 전파한다. 이동·밖 관측은 장소와 무관한 Item 온도 근거로 사용한다. 교통수단은 Item 체감 계산에서 제외한다.
- 맥락 `모름`은 원래 Outfit에서만 보여주고 다른 Outfit으로 전파하지 않는다.
- 동일 조건에서 OK와 불편 기록이 충돌하면 불편 기록을 우선하되 모두 상세 근거로 보존한다.
- HOME은 같은 장소·외기온의 과거 냉난방 경향을 기본 제안하고 수정할 수 있게 한다. 냉방 켬/끔 결과가 섞이면 조건별로 나누고 하나를 임의 확정하지 않는다.
- 정렬 순서는 기본 온도 적합성 → 장소·Item 체감 → 같은 장소의 익숙한 Outfit → Favorite/평점 → 전체 착용 횟수·최근 착용이다.
- 같은 장소+교통수단에서 정확한 Outfit을 2회 이상 입은 기록은 보조 근거로 유지하고, 부족하면 장소 2회 이상 기록으로 보완한다.
- 추천 카드에는 가장 중요한 상황 근거 한 줄만 표시하고 전체 Item·냉난방·과거 로그 근거는 상세에서 제공한다.

## Public Interfaces 및 데이터 계약

- Replacement Line repository에 조회, 원자적 계보 저장, Line 병합, 보관 API를 추가한다.
- `ReplacementLine`, `LineageMembership`, `LineageEdge`, `LineReviewStatus` 타입을 앱 snapshot과 lazy query에 연결한다.
- `WearLog` 입력에 실내 상태를 추가하고 `ItemThermalObservation` 및 보완 Item relation을 별도 구조로 저장한다.
- `RecommendationResult`에는 상황 근거, 적용 Item, 경고 영향, HVAC 조건, 익숙한 Outfit 횟수를 추가한다.
- 모든 새 테이블과 RPC는 workspace 일치, membership, RLS, INSERT/UPDATE/DELETE 권한을 검증한다.
- Notion seed 이후에는 Supabase만 쓰기 원본으로 사용한다.

## Test and Release Plan

- P4-1: 복수 계절 중복 제거, 현재/과거 연도, 구매일 미상, 신규 구매, Retired, Never Worn과 연도 미착용 분리를 fixture로 검증한다.
- P4-2: 복수 루트·복수 predecessor·합류·복수 Line 소속·순환 차단·원자 저장·병합·보관·다른 workspace 차단을 테스트한다.
- P4-3: 온도 구간 ±2°C, 장소 안/이동/모름, HVAC 혼합, 불편 우선, 주의/후순위, 검증된 보완, 기존 추천 정렬 회귀를 테스트한다.
- 각 단계에서 TypeScript, 전체 Vitest, production build, 390px 모바일과 PC UI, 키보드 접근성, RLS/pgTAP, 원격 전후 수량을 검증한다.
- P4-2와 P4-3의 migration·seed·backfill은 미리보기와 승인 후 적용한다.
- 각 단계는 독립 배포하고 공개 자산과 실제 인증 경로까지 확인한 뒤 다음 단계로 넘어간다.

## Assumptions and Exclusions

- 현재 Notion은 Replaces 초안의 일회성 레거시 원본이며 지속 동기화하지 않는다.
- 가지 이름과 선택 이유는 선택 사항이고 계보 완성 조건이 아니다.
- 물리적 재고 수량 필드는 추가하지 않으며 Active/Retired Item 수로 현황을 보여준다.
- 독립 Outfit·장소·교통수단 통계 화면은 만들지 않는다.
- Calendar/Favorite 내비게이션 이동, 세탁, 알림, 오프라인, 장기 미착용 임계값과 멸종 위험 자동화는 별도 후속 계획으로 둔다.
