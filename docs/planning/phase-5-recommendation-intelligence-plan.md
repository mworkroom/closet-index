# Closet Index Phase 5 Recommendation Intelligence Initial Plan

- 작성일: 2026-08-02
- 상태: P5-0A·P5-0B 완료, P5A-1 Policy B disabled HOME 통합 완료, production 활성화 전
- 선행 단계: Phase 4 Statistics & Replacement Lineage
- 목적: Phase 4 논의 중 나온 추천 알고리즘의 제품 원칙과 구현 가설을 보존하고, Phase 5 착수 시 재검증할 출발점으로 사용
- 관련 문서: [Roadmap](./roadmap.md), [Phase 4 Plan](./phase-4-maintenance-insights-plan.md), [Phase 2 Weather Plan](./phase-2-weather-plan.md), [Product Plan](./product-plan.md)

> 이 문서는 확정 구현 명세가 아니라 초기 설계 기록이다. 데이터 수량, 반복 횟수 임계값, schema와 추천 가중치는 P5-0에서 현재 production 데이터로 다시 검증한다.

## 1. 목표

Phase 5의 목표는 과거에 실제로 검증한 Outfit을 현재의 온도·장소·이동·실내 환경에 맞게 더 잘 다시 찾는 것이다.

```text
오늘의 온도·장소·교통수단
→ 온도상 입을 수 있는 Outfit 후보
→ 같은 맥락에서 실제로 입었던 경험 확인
→ 장소 HVAC와 Item 체감 근거 확인
→ 익숙하고 위험이 적은 Outfit을 설명과 함께 추천
```

Phase 5는 장소나 교통수단의 통계 숫자를 별도로 보여주는 단계가 아니다. J가 꾸준히 입력한 Wear Log를 이용해 HOME에서 다음과 같은 추천 근거를 제공하는 단계다.

> 이 장소에 갈 때 이 Outfit을 5번 입었습니다.

## 2. Phase 경계

| Phase | 소유하는 질문 |
|---|---|
| Phase 4 | 이 Item을 얼마나, 어느 달에 입었고 Replacement Line이 어떻게 이어지는가? |
| Phase 5 | 오늘의 맥락에서 어떤 Outfit이 과거에 잘 작동했는가? |
| Phase 6 | 이 Item을 언제 세탁하고 언제 교체·재구매해야 하는가? |

Phase 5에는 다음을 넣지 않는다.

- 장소·교통수단 자체의 독립 Statistics 화면
- AI가 새 조합을 자동으로 만드는 스타일링
- 기존 Outfit의 Item relation 자동 변경
- 세탁, 교체, 재구매, 세일 알림
- 설명할 수 없는 단일 AI 추천 점수

## 3. 현재 추천 기준선

현재 HOME 추천은 다음 원칙을 사용한다.

- 출발·귀가 평균 온도로 기본 적합성과 순위를 계산한다.
- 출발 온도와 귀가 온도 endpoint로 추움·더움 위험을 경고한다.
- 한 번 `OK`였던 온도에는 기본적으로 ±2°C 허용 범위를 사용한다.
- 온도 적합성 다음에 Rating, 착용 횟수, 최근 착용일을 사용한다.
- 장소와 교통수단의 과거 착용 횟수는 추천 설명에 나타나지만 공동 맥락으로 순위에 반영하지 않는다.
- Outfit은 고정된 Item 조합이며 Item 하나가 달라지면 다른 Outfit이다.

현재 overall thermal model은 P5A-1 이후에도 baseline이자 evidence가 부족할 때의 fallback으로 유지한다. 다만 모든 Transport의 관측을 합친 overall range만을 영구적인 유일 source로 확정하지 않는다. Phase 5는 기존 온도 안전성을 버리고 장소 점수로 교체하는 작업이 아니라, **온도상 가능한 후보 안에서 Transport·Place scope의 관측 근거와 실제 맥락의 결과를 더하는 작업**이다.

## 4. 제품 원칙

### 4.1 과거의 검증된 경험을 우선한다

- 같은 Outfit을 같은 장소와 같은 교통수단으로 반복해 입은 기록은 강한 익숙함 근거다.
- 교통수단이 다르거나 비어 있어도 같은 장소에서 반복해 입은 기록은 보조 근거가 될 수 있다.
- 장소·교통수단별 총횟수를 따로 더하지 않고 같은 Wear Log에서 조건이 함께 일치하는 공동 횟수를 계산한다.
- 반복 착용 횟수는 별도 Statistics 카드가 아니라 추천 이유에 사용한다.

### 4.2 온도 안전성이 맥락 익숙함보다 우선한다

- 장소에서 자주 입었다는 이유로 현재 온도에 명백히 맞지 않는 Outfit을 정상 후보처럼 올리지 않는다.
- 기존 평균 온도 정렬과 endpoint 경고를 유지한다.
- 맥락 근거는 온도상 가능한 후보의 재정렬·설명·경고 보강에 사용한다.

### 4.3 예상과 실제 관측을 분리한다

- Place Profile은 그 장소에서 예상되는 냉난방 성향이다.
- Wear Log HVAC는 그날 실제로 관찰한 냉방·난방 상태다.
- 직접 입력한 Item 체감은 Outfit 이력에서 간접 계산한 Item 근거보다 높은 신뢰도를 갖는다.
- 모든 추천 근거는 출처와 신뢰도를 추적할 수 있어야 한다.

### 4.4 기존 Outfit을 변경하지 않는다

- 보완 Item이 실제로 추가되면 기존 Outfit을 수정하지 않는다.
- 기존 Outfit을 복제해 Item을 추가하거나 새 Outfit을 만든다.
- 실제로 입은 새 Outfit의 Wear Log로 보완 조합의 성공 여부를 검증한다.

## 5. P5A — Recommendation Evidence

P5-0B에서 Transport가 단순한 familiarity 차원이 아니라 thermal evidence의 범위를 바꿀 수 있음이 확인됐다. 따라서 P5A를 다음 두 경계로 나눈다.

### P5A-1. Transport-conditioned Thermal Evidence

- `overall`, `currentTransport`, `currentPlace`, `exactContext`, `nullTransport` scope를 분리한다.
- 각 scope에서 raw/expanded OK range와 cold/hot 관측, matched Wear Log ID, inferred endpoint, source Place·Transport를 보존한다.
- historical null Transport는 특정 Transport 근거로 보지 않는다.
- current Place가 null이면 `currentPlace`와 `exactContext`를, current Transport가 null이면 `currentTransport`와 `exactContext`를 만들지 않는다.
- `longWalkCondition`을 Transport thermal evidence로 대체 사용하지 않는다.
- HOME 통합 전에 최소 evidence threshold와 warning·deprioritize·exclude behavior를 별도 결정한다.
- 아래 disabled 통합 결정은 deprioritize만 채택하며 hard exclusion을 사용하지 않고 cold/hot·rain·long-walk 기존 warning을 약화하지 않는다.

#### 2026-08-07 Policy B disabled 통합 결정

- current Transport distinct Wear Log 0건은 unknown, 1건은 weak, 2건 이상은 strong evidence로 본다.
- overall range만 target을 지원하고 current Transport range는 지원하지 않을 때만 같은 기존 recommendation level 안에서 후순위로 보낸다.
- 지원 후보는 승격하지 않고 Outfit을 제외하지 않는다.
- 기존 warning, reason, group, comparator fallback은 보존한다.
- exact Place + Transport evidence는 cross-Place Transport evidence보다 높은 confidence지만 지원 후보 승격에는 사용하지 않는다.
- current Transport가 null이면 적용하지 않는다.
- development 전용 flag는 기본 `false`이며 production에서는 강제로 비활성이다.
- read-only production 9-input matrix에서 5개 입력이 변하고 deep-list churn이 커서 production 활성화 준비는 되지 않았다.
- authenticated local HOME manual QA에서 33°C Walk 개선과 Car·Transport null 무변경을 확인했지만, 최근 구매 group tie와 Place null pagination까지 영향을 주는 경계가 발견됐다.

#### 2026-08-07 Transport taxonomy validation

- 역사적 Walk는 일반적인 모든 도보 이동이 아니라 약 20~30분 이상의 지속적이거나 빠른 걷기를 뜻했다.
- 새 데이터는 `walk_short`(`도보 · 근거리`) 또는 `walk_sustained`(`도보 · 지속`)를 사용한다.
- 10~20분 경계는 시간만으로 정하지 않는다. 열감 증가가 거의 없으면 short, 땀·빠른 지속 보행처럼 체열이 뚜렷하게 오르면 sustained를 선택한다.
- production 전환 전 기존 Walk는 audit에서 legacy/unclassified로 유지한다. 승인된 수동 전환은 기존 row ID를 유지한 채 `도보 · 지속`으로 rename하고 `도보 · 근거리` row를 정확히 1개만 추가한다.
- 초기 수동 backfill 후보는 J가 확인한 16건뿐이다. 15건은 short로 editor에서 재지정하고, sustained 1건은 기존 ID가 유지되므로 별도 DB update가 필요하지 않다.
- CGV + Walk 33°C는 synthetic stress fixture이며 실제 acceptance는 가까운 목적지의 short Walk, CGV + Car, sustained summer Walk, current Transport null이다.
- human-reviewed replay에서 short/sustained 분리는 원하는 33°C nearby 결과를 복구했지만 weak 1건의 하락 폭은 여전히 과했다.
- Policy B는 계속 disabled다. 다음 recommendation 실험에서는 current-Transport 1건을 informational evidence로만 표시하고, ranking 영향은 2건 이상에서만 허용한다.
- HVAC와 Place Profile은 Transport taxonomy와 분리된 후속 작업으로 유지한다.

### P5A-2. Context Familiarity Ranking

#### 목표

새 schema 없이 현재 Wear Log의 Outfit·Place·Transport relation만으로 맥락 추천의 가치를 먼저 검증한다.

#### 초기 가설

```text
1차 맥락 근거
= 같은 Outfit + 같은 Place + 같은 Transport가 함께 일치한 Wear Log 2건 이상

2차 맥락 근거
= 같은 Outfit + 같은 Place가 함께 일치한 Wear Log 2건 이상
```

`2건 이상`은 초기 후보값이며 영구 규칙이 아니다. P5-0에서 실제 분포를 확인해 한 번의 우연한 착용과 반복 습관을 구분할 최소값을 확정한다.

반복 exposure만으로 positive familiarity를 주장하지 않는다. P5A-2의 후보 outcome tier는 다음과 같으며 아직 HOME ranking에 구현하거나 활성화하지 않는다.

- `verified`: exposure >= 2, success >= 2, issue = 0
- `mixed`: exposure >= 2, success와 issue가 모두 존재
- `issue`: exposure >= 2, success = 0, issue >= 1

위 조건에 들지 않는 반복은 exposure evidence일 뿐 성공으로 부르지 않는다. Positive familiarity ranking은 `verified`처럼 실제 success와 issue 부재가 확인된 경우만 후보가 될 수 있다.

#### 추천 순서의 초기안

```text
기존 온도 적합성·위험 판정
→ 현재 조건에 맞는 후보 pool
→ 같은 Place + Transport 공동 착용 근거
→ 같은 Place 착용 근거
→ 기존 Rating
→ 기존 착용 횟수
→ 최근 착용일
```

맥락 점수는 장소 횟수와 교통수단 횟수를 따로 더한 값이 아니다. 한 Wear Log가 현재 장소와 현재 교통수단을 동시에 만족할 때 공동 근거 1건으로 센다.

#### HOME 설명 예시

- `Place A · Transport A에서 5번 입음`
- `이 장소에서 7번 입음`
- `비슷한 온도에서 OK 3회`
- `장소 기록은 있지만 교통수단 일치 기록 없음`

설명은 추천 순위를 만든 실제 근거만 보여주며, 사용하지 않은 장소·교통수단 통계를 부풀려 표시하지 않는다.

## 6. P5B — Place Profile & HVAC

### 6.1 Place 종류

현재 Place에는 구체적인 장소와 넓은 범주의 장소가 함께 존재할 수 있다.

- `specific venue`: 특정 영화관 지점, 특정 카페 지점처럼 환경을 반복해서 예상할 수 있는 장소
- `generic place category`: 도서관, 편의점, 기타처럼 실제 환경이 매번 달라질 수 있는 범주

HVAC 성향의 자동 적용은 specific venue에만 허용한다. 특정 편의점에서 추웠다는 기록을 모든 편의점에 전파하지 않는다.

### 6.2 Place Profile

Place Profile은 앞으로 방문할 때 예상할 수 있는 기본 환경이다.

초기 필드 후보:

- Place
- 적용 계절
- 예상 HVAC: 냉방 / 난방 / 미가동 / 모름
- 예상 강도
- 메모
- 출처: 수동 지정 / 과거 관측 기반
- 마지막 확인일

J가 이미 확실히 알고 있는 장소 특성은 수동으로 지정할 수 있다. 앱은 Place Profile을 HOME의 기본 예상값으로 사용하되 확정 사실처럼 숨기지 않고 출처를 표시한다.

### 6.3 Wear Log HVAC

Wear Log HVAC는 실제 착용일의 관측값이다.

초기 필드 후보:

- 실제 HVAC: 냉방 / 난방 / 미가동 / 모름
- 실제 강도
- 실제 체감 메모

Wear Log 작성 시 Place Profile을 기본 제안할 수 있지만, 그날의 실제 상태로 수정할 수 있어야 한다. 예상 Profile 값을 Wear Log에 조용히 확정 복사하지 않는다.

## 7. P5C — Item Thermal Observation

### 7.1 목표

Outfit 전체가 추웠거나 더웠다는 기록만으로 부족할 때, 실제 영향을 준 Item 단위 체감 근거를 남긴다.

초기 데이터 후보:

- `wear_log_id`
- `item_id`
- 체감: cold / ok / hot
- 맥락: inside_place / transit_outside / unknown
- 영향: warning_only / deprioritize
- memo
- provenance: direct / derived

### 7.2 직접 관측과 간접 근거

- `direct`: J가 해당 Wear Log와 Item에 대해 직접 남긴 체감
- `derived`: Outfit의 과거 OK 기록과 공통 Item을 이용해 계산한 간접 근거

두 근거는 같은 테이블에 있더라도 provenance를 지우거나 합쳐 저장하지 않는다. 추천에서는 직접 관측을 더 높은 신뢰도로 사용하고, 간접 근거는 설명 가능한 보조 근거로 사용한다.

### 7.3 영향 범위

- 첫 구현은 직접 관측을 경고 또는 후순위 근거로 사용한다.
- 한 번의 cold/hot 기록만으로 Item이나 Outfit을 영구 제외하지 않는다.
- 현재 장소·온도·HVAC와 유사한 경우에만 관련 관측을 적용한다.
- 유사하지 않은 장소나 넓은 generic place category에 관측을 전파하지 않는다.

## 8. 보완 Item과 Outfit 무결성

다음 상황을 별도의 Outfit으로 기록한다.

```text
Outfit A를 특정 장소에서 입음
→ 추웠음
→ 가디건을 보완 후보로 계획

다음 착용에서 가디건을 실제로 추가
→ Outfit A를 복제해 가디건이 포함된 Outfit B 생성
→ Outfit B로 Wear Log 기록
→ Outfit B가 OK이면 보완 조합 검증 완료
```

- 계획한 보완 Item은 실제 착용 전까지 원본 Outfit의 구성으로 간주하지 않는다.
- 검증 결과는 Outfit B의 실제 Wear Log에서 계산한다.
- Outfit A의 과거 Wear Log에 가디건을 소급해서 추가하지 않는다.
- 검증 관계를 별도 저장할 필요가 있는지는 P5C 실사용 뒤 결정한다. 가능한 경우 실제 Outfit B와 Wear Log를 원본으로 사용한다.

## 9. 온도와 근거 신뢰도

### 9.1 ±2°C의 역할

기존 ±2°C 규칙은 현재 추천 공식을 대체하지 않는다.

- 기존 추천: 평균 온도 적합성 + 출발·귀가 endpoint 경고
- Phase 5 관측 검색: 비슷한 장소·Item 체감 사례를 찾는 온도 유사성 후보

정확히 어느 온도값끼리 ±2°C를 비교할지는 P5-0에서 현재 데이터 분포와 함께 확정한다.

### 9.2 추론된 귀가 온도

초기 설계 검토 당시 많은 과거 Wear Log의 `temp_back`은 실제 귀가 온도가 아니라 출발 온도를 복사한 `temp_back_inferred`였다. 정확한 수량은 계속 변하므로 P5-0에서 다시 집계한다.

초기 신뢰도 원칙:

```text
실제 temp_out + 실제 temp_back
→ 양쪽 endpoint를 온도 근거로 사용

temp_back_inferred
→ temp_out 중심으로 비교하고 낮은 신뢰도로 표시

temp_out 없음
→ 온도 근거에서는 제외
→ 장소·교통수단 익숙함 근거에는 사용 가능
```

추론값을 실제 관측값과 같은 신뢰도로 학습하지 않는다.

## 10. 화면 흐름 초기안

### 10.1 HOME

```text
현재 온도·장소·교통수단 입력
→ 추천 Outfit 목록
→ 핵심 추천 이유
→ 근거 펼치기
```

핵심 추천 이유는 한두 줄을 우선한다.

- 현재 온도 적합성
- 같은 장소·교통수단 반복 착용
- 예상 HVAC 경고
- 직접 Item 체감 경고

세부 횟수와 provenance는 펼침 영역에서 확인한다. 모든 근거를 카드 전면에 동시에 표시하지 않는다.

### 10.2 Place 관리

- specific venue / generic category 구분
- 계절별 예상 HVAC Profile
- 수동 지정과 관측 기반 출처
- 오래된 Profile 확인 필요 상태

Place Profile은 Statistics에 넣지 않고 More 아래의 관리 화면 또는 Place 편집 흐름에서 다룬다.

### 10.3 Wear Log

- 기존 Outfit·장소·교통수단·온도 입력 유지
- 선택적으로 당일 실제 HVAC 기록
- 선택적으로 Item별 cold / ok / hot 관측
- 빠른 기록을 막지 않도록 고급 관측은 선택 입력 또는 후속 편집으로 제공

## 11. 데이터와 보안

### 11.1 P5A

- 기존 `closet_wear_logs`, `closet_outfits`, Place·Transport relation을 사용한다.
- 초기 검증에는 새 migration이 필요하지 않다.
- 공동 맥락 횟수는 workspace 경계를 통과한 authenticated 데이터에서 계산한다.
- 실제 성능 문제가 확인되기 전에는 중복 집계값을 저장하지 않는다.

### 11.2 P5B·P5C

schema 후보는 다음 책임을 분리한다.

- Place의 종류와 예상 Profile
- Wear Log의 실제 HVAC 관측
- Wear Log에 연결된 Item 직접 체감
- 계산으로 만든 derived evidence

정확한 테이블·column 이름은 P5-0과 입력 UI 검증 뒤 확정한다.

- workspace membership과 소유권을 모든 row에 적용한다.
- 직접 관측을 derived 값으로 덮어쓰지 않는다.
- derived evidence는 필요하면 다시 계산할 수 있어야 한다.
- Profile 수정이 과거 Wear Log의 실제 관측을 변경하지 않는다.
- migration 전 pgTAP, RLS, grant, Advisor 계획을 작성한다.

## 12. 구현 단계

### P5-0. Recommendation Evidence Audit

- [x] 현재 추천 순서와 점수 계산을 fixture로 고정
- [x] Place·Transport null과 공동 조합 분포 확인
- [x] 같은 Outfit + Place + Transport 반복 횟수 분포 확인
- [ ] specific venue와 generic place category 후보 분류
- [x] `temp_back_inferred`와 실제 endpoint 비율 재확인
- [ ] 기존 HVAC memo와 장소별 반복 관측 확인
- [ ] 직접 Item 체감을 기록할 실제 사례 3~5개 정리
- [x] threshold 1·2·3 및 disabled 순위 영향 비교

### P5-0B. Transport-conditioned Thermal Evidence Audit

- [x] 현재 추천과 동일한 endpoint·dedup·±2°C baseline pass
- [x] inferred 귀가 endpoint를 제외한 higher-confidence sensitivity pass
- [x] Transport별 range·warning provenance와 null Transport 분리
- [x] threshold 1·2·3 range borrowing 및 cross-Transport conflict 집계
- [x] product policy 없이 익명 same-Place 후보 사례 검토

### P5A-1. Transport-conditioned Thermal Evidence

- [x] HOME에 연결되지 않은 순수 deterministic evidence calculator
- [x] currentPlace·exactContext·nullTransport scope와 provenance 확장
- [x] Policy A·B·C·D disabled 비교 및 production read-only 영향 집계
- [x] 최소 current-Transport evidence threshold 결정: 0 unknown, 1 weak, 2+ strong
- [x] Policy B disabled 후보의 overall fallback과 deprioritize-only behavior 결정
- [x] hard exclusion은 현재 audit 근거로 지지되지 않음
- [x] 기존 eligibility·warning을 바꾸지 않는 disabled HOME ordering 통합
- [ ] 최근 구매 partition 전후의 Policy B 적용 위치 결정
- [ ] weak evidence 이동 폭·Place null·inferred endpoint 제한 검토

### P5A-2. Context Familiarity Ranking

- [ ] verified·mixed·issue outcome tier 확정
- [ ] 공동 Place + Transport 착용 횟수 계산
- [ ] Place-only fallback 계산
- [ ] 기존 온도 후보 pool 뒤의 맥락 재정렬
- [ ] HOME 추천 이유와 근거 펼침
- [ ] 새 migration 없이 실사용 검증
- [ ] 기존 추천 결과와 위험 경고 회귀 테스트

### P5B. Place Profile & HVAC

- [ ] Place 종류와 Profile schema·RLS
- [ ] specific venue 관리 UI
- [ ] HOME의 예상 HVAC 표시
- [ ] Wear Log의 당일 실제 HVAC 입력·수정
- [ ] 예상 Profile과 실제 관측 provenance 표시
- [ ] generic place로의 자동 전파 차단

### P5C. Item Thermal Observation

- [ ] Item 직접 체감 schema·RLS
- [ ] Wear Log 후속 관측 UI
- [ ] direct와 derived evidence 분리
- [ ] warning_only / deprioritize 적용
- [ ] 보완 Item 계획과 Outfit 복제 연결
- [ ] 실제 Outfit B Wear Log를 이용한 검증

### P5D. 통합 검증과 공개

- [ ] TypeScript 검사, 전체 Vitest, production build
- [ ] 기존 추천 fixture와 새 추천 결과 비교
- [ ] 실제 장소·교통수단 표본에서 설명과 순위 대조
- [ ] 추론 온도와 실제 온도의 신뢰도 차이 검증
- [ ] 모바일 HOME·Wear Log·Place 관리 QA
- [ ] RLS·grant·Advisor와 다른 workspace 비노출 검증
- [ ] 공개 배포 뒤 인증된 HOME 결과와 console 확인

## 13. 확정된 결정과 미확정 항목

### 확정된 결정

- Phase 5는 추천 알고리즘을 소유한다.
- 장소와 교통수단은 독립 통계보다 HOME 추천 근거로 사용한다.
- 기존 온도 적합성과 endpoint 경고를 유지한다.
- overall thermal model은 baseline/fallback으로 유지하되 유일한 영구 source로 고정하지 않는다.
- 현재 P5-0B·P5A-1 evidence는 Outfit hard exclusion을 지지하지 않는다.
- Place의 예상 HVAC와 Wear Log의 실제 HVAC를 분리한다.
- specific venue와 generic place category를 구분한다.
- 직접 Item 관측과 derived evidence의 provenance를 보존한다.
- 보완 Item이 추가되면 기존 Outfit을 수정하지 않고 새 Outfit으로 검증한다.

### 아직 확정하지 않은 항목

- 공동 맥락을 인정할 최소 반복 횟수
- 맥락 근거가 기존 Rating·착용 횟수·최근 착용일보다 앞서는 정확한 범위
- Place Profile의 최소 필드와 입력 위치
- HVAC 강도 단계
- Item 체감 입력의 최소 단위와 영향 수준
- ±2°C 관측 유사성의 endpoint 비교 방식
- derived evidence를 저장할지 요청 시 계산할지
- Policy B weak evidence의 최대 이동 폭, Place null 적용 범위, 최근 구매 partition 적용 위치
- same-Place와 exactContext를 어느 threshold부터 ranking 근거로 사용할지
- P5A-2 verified·mixed·issue tier의 comparator 위치

## 14. 완료 정의

- [ ] 현재 온도에 맞는 후보 안에서 같은 장소·교통수단의 실제 반복 착용이 추천에 반영된다.
- [ ] `이 장소·교통수단에서 N번 입음`이라는 근거가 실제 공동 Wear Log 수와 일치한다.
- [ ] 장소·교통수단 독립 통계를 만들지 않고도 HOME 추천이 유용해진다.
- [ ] 예상 HVAC와 당일 실제 HVAC가 데이터와 UI에서 구분된다.
- [ ] generic place의 관측이 다른 장소 전체에 자동 전파되지 않는다.
- [ ] 직접 Item 체감과 간접 계산 근거의 provenance와 신뢰도가 유지된다.
- [ ] 반복 착용 근거가 현재 온도 위험을 덮어쓰지 않는다.
- [ ] 보완 Item 때문에 기존 Outfit과 과거 Wear Log가 변경되지 않는다.
- [ ] 추천 이유를 펼쳐 실제 원본 Wear Log와 계산 기준을 이해할 수 있다.
- [ ] 기존 HOME 수동 입력, 날씨 자동화, Outfit 선택, Wear Log 저장 흐름에 회귀가 없다.
