# Phase 5 Transport Taxonomy Validation

- 실행일: 2026-08-07 KST
- 범위: Transport 의미론 read-only 감사와 test-only 분리 시뮬레이션
- production 변경: 없음
- Policy B: 계속 비활성
- Supabase 접근: 6개 고정 SELECT stream만 사용, write 없음

## 1. 검증 목적과 경계

현재 `Walk`는 역사적으로 약 20~30분 이상의 지속적이거나 빠른 걷기를 뜻했지만, 새로 확인된 5~10분 내외의 가까운 목적지 이동과 UI 값 하나로 표현될 가능성이 있다. 두 상황은 야외 노출과 활동 열부하가 달라 같은 thermal evidence bucket으로 쓰면 서로의 온도 범위를 오염시킬 수 있다.

이번 검증에서는 다음 test-only 개념만 사용했다.

- `walk_short`: 약 5~10분, 짧은 야외 노출, 지속적인 빠른 걷기 열부하 없음
- `walk_sustained`: 약 20~30분 이상, 지속적이거나 빠른 걷기
- 10~20분처럼 경계가 모호한 이동: 자동 분류하지 않고 수동 검토

`longWalkCondition`은 신발 적합성 조건으로만 유지하며 Transport 의미·시간·열 활동량을 대신하지 않는다. 생산 Transport row, Wear Log, HOME UI, recommendation comparator, Outfit 구성, Item category는 변경하지 않았다.

## 2. Read-only 데이터 범위

### 2.1 현재 Transport와 역사적 Walk

| active Transport | distinct Wear Logs |
|---|---:|
| Walk | 207 |
| Bus | 3 |
| Subway | 47 |
| Car | 469 |

역사적 Walk 207건은 154개 distinct Outfit에 걸쳐 있다. Place null은 2건이고, inferred return temperature가 포함된 Wear Log는 150건이다. 날짜·Place 이름만으로 `walk_short` 또는 `walk_sustained`를 확정하지 않았으므로 자동으로 `walk_short` 근거가 될 수 있는 기록은 0건이다.

계절 분포는 autumn 85, spring 64, summer 38, winter 20이다. `temp_out` 분포는 `<0`: 5, `0~9`: 36, `10~19`: 79, `20~24`: 49, `25~27`: 14, `28~29`: 3, `30~32`: 7, `33+`: 5, missing: 9다. Wear Log 단위 feeling outcome은 OK 145, cold 1, hot 1, mixed 60이다.

exact Outfit + Place + Walk 반복 분포는 1회 group 155개, 2회 18개, 3회 2개, 4회 2개다. 이 합계는 Place가 있는 Walk 205건이며, Place null 2건은 exact group에서 제외된다.

### 2.2 가까운 카페 후보 Place

개인 Place 이름은 이 문서에 기록하지 않았다. 문자열상 후보 Place는 3개이며 합계 80건이 모두 현재 Walk이고 다른 Transport와 null Transport는 0건이다.

| metric | distinct Wear Logs |
|---|---:|
| 전체 | 80 |
| June~August | 16 |
| `temp_out >= 28°C` | 6 |
| `temp_out >= 30°C` | 5 |
| confirmed `walk_short` | 0 |

연도별 분포는 2021: 1, 2022: 1, 2023: 9, 2024: 23, 2025: 35, 2026: 11이다. active Outfit × 후보 Place × active Transport universe를 기준으로 exact group threshold는 다음과 같다.

| threshold | qualifying groups | zero-evidence groups |
|---:|---:|---:|
| 0 | 6,084 | 6,015 |
| 1 | 69 | 0 |
| 2 | 8 | 0 |
| 3 | 2 | 0 |

현재 80건은 Place 이름 때문에 짧은 걷기로 간주하지 않았다. 따라서 가까운 카페의 새 `walk_short` context는 현재 증거 계약에서 cold start다.

### 2.3 영화관 Place

개인 Place 이름은 기록하지 않았다. 문자열상 영화관 후보 Place 9개의 summer 기록은 Car 106건, 현재 Walk 3건, other/null 7건이다. 기존 `33°C + cinema + Walk`는 혼합 bucket의 문제를 드러내는 synthetic stress fixture로만 유지하며 실제 acceptance의 중심으로 사용하지 않는다.

## 3. Test-only 분리 시뮬레이션

시뮬레이터는 생산 앱에서 import하지 않는 별도 순수 모듈이다. 역사적 Walk Wear Log ID별 수동 분류 map을 받아 다음 bucket으로만 재매핑한다.

- `walk_short`
- `walk_sustained`
- `walk_unclassified`
- `car`
- `other`
- null Transport

`walk_short`와 `walk_sustained`는 서로의 current-Transport 또는 exact-context count와 range에 포함되지 않는다. historical null Transport도 어느 bucket에도 포함되지 않는다. matched Wear Log ID는 유지되고 distinct ID로 한 번만 센다.

### 3.1 필수 fixture 결과

| fixture | Model 0 baseline | Model 1 unsplit Policy B | Model 2 split simulation |
|---|---|---|---|
| mixed Walk: 24 Walk OK, 28·33 Car OK, target 33 Walk | baseline order | Walk 1건, 22~26°C, weak borrowed-only | 기존 모호성을 보여 주는 비교 기준 |
| short separated | baseline order | 단일 Walk bucket에서는 borrowed-only | `walk_short` 1건, exact 1건, current 22~26°C, overall 22~35°C, weak borrowed-only; Car는 short 근거에 불포함 |
| sustained separated | baseline order | 단일 Walk bucket | `walk_sustained` 2건, exact 2건, current 27~33°C, overall 27~37°C, supported; short 35°C가 sustained range를 확장하지 않음 |
| short cold start | baseline order | 기존 Walk를 사용할 수 있음 | current 0건, exact 0건, range 없음, unknown, adjustment 0 |
| 33°C Car + cinema | baseline order | Car-supported order | Walk 분리 후에도 같은 order, adjustment 0 |

추가 fixture에서 current Place null은 exact-context만 비활성화하고 current-Transport scope는 유지했다. current Transport null은 조정을 완전히 비활성화했다. historical null Transport는 split bucket에 들어가지 않았다. inferred-return-only 영향은 별도로 표시했고, 입력 순서를 뒤집거나 같은 Wear Log row를 중복 전달해도 결과와 distinct matched ID가 같았다.

## 4. 생산 snapshot의 세 모델 비교

Model 2는 어떠한 역사적 Walk도 자동 분류하지 않는 엄격한 가정을 사용했다. 따라서 모든 역사적 Walk는 `walk_unclassified`이고 새 short/sustained bucket의 current count는 0이다. Outfit alias는 snapshot 안에서 결정적으로 생성한 익명 값이다.

| scenario | Model 0 top 6 | Model 1 top 6 | Model 2 top 6 | direct adjustments M0/M1/M2 |
|---|---|---|---|---:|
| 33°C, nearby Place 1~3, short Walk | 138, 184, 082, 044, 098, 301 | 138, 044, 098, 301, 316, 275 | 138, 184, 082, 044, 098, 301 | 0 / 2 / 0 |
| 33°C, primary cinema, Car | 138, 184, 082, 044, 098, 301 | same | same | 0 / 0 / 0 |
| 30°C, Place null, sustained Walk | 138, 184, 368, 082, 087, 189 | 138, 368, 087, 189, 280, 337 | 138, 184, 368, 082, 087, 189 | 0 / 3 / 0 |
| 33°C, Transport null | 138, 184, 082, 044, 098, 301 | same | same | 0 / 0 / 0 |

가까운 Place 세 곳에서 Model 2의 top 6가 Model 0로 돌아온 이유는 분리가 기존 Walk 증거를 새 short 증거로 변환하지 않기 때문이다. 즉 분리는 오염을 막지만 원하는 가벼운 여름 Outfit 순서를 스스로 만들지 않는다.

Car 영화관에서는 상위 후보의 current Car distinct count가 1~6건이었고 모두 current range가 target을 지원했다. Model 0/1/2의 전체 순서가 같아 Walk 분리가 기존 Car-supported warm-layer order를 내리지 않았다. 다만 강한 냉방이라는 Place HVAC 사실은 현재 모델에 없으며 이번 단계에서 구현하지 않았다.

각 production scenario의 상위 6개에서는 inferred return 제외 여부가 결과를 바꾸지 않았다. 전체 후보 pool에서는 27~28개 Outfit의 range 또는 Policy B 판단이 inferred endpoint에 민감했으므로, 향후 분류 후에도 sensitivity pass는 유지해야 한다.

## 5. 제품 질문에 대한 답

1. **short와 sustained를 분리하면 상호 오염을 막는가?** 그렇다. fixture에서 서로의 count, exact match, current range를 확장하지 않았다.
2. **현재 `walk_short`를 지지할 수 있는 역사적 기록은 몇 건인가?** 자동 분류 없이 확정 가능한 기록은 0건이다.
3. **가까운 카페 여름 context는 cold start인가?** 그렇다. 해당 Place의 Walk 기록은 많지만 short로 확정된 기록은 없다.
4. **Transport 분리만으로 원하는 가까운 카페 추천을 만들 수 있는가?** 아니다. Policy B의 0건 계약은 unknown/no adjustment이므로 Model 2는 baseline order를 유지했다.
5. **남은 이유는 무엇인가?** short-Walk 데이터 부족과 Place 실내 냉방 신호 부재가 모두 남는다. 영화관 acceptance에는 특히 HVAC가 독립된 누락 신호다.
6. **두 Transport 선택지로 충분한가?** 현재 확인된 의미 차이를 수집하기에는 충분하다. 별도 duration/activity 필드를 지금 추가할 근거는 아직 없으며, 10~20분 경계 사례는 우선 수동 분류 대상으로 남긴다.
7. **어떤 역사 기록을 수동 분류해야 하는가?** 실제 data migration이나 완전한 backfill 전에는 역사적 Walk 207건 전체가 검토 대상이다. 다만 다음 test-only replay에는 후보 Place의 hot-weather 행만으로 충분하다.
8. **다음 제품 단계는 무엇인가?** 세 후보 Place 중 실제 nearby Place를 사람이 식별하고, 해당 범위의 hot-weather Walk 행만 수동 분류해 test-only replay를 실행한다. Transport row·label·과거 Wear Log 변경은 별도 승인 전까지 보류한다.

## 6. Recommended next boundary

다음 단계는 human-reviewed test-only replay로 제한한다.

- 세 café 후보는 J의 실제 nearby Place 식별이 필요하다.
- 첫 replay에 역사적 Walk 207건 전체 backfill은 필요하지 않다.
- 첫 replay는 J가 확인한 nearby Place의 hot-weather Walk 행만 사용한다.
- 기존 Walk는 backfill policy가 승인될 때까지 `legacy/unclassified`로 유지한다.
- `walk_short` 또는 `walk_sustained`로 명시 확인된 Wear Log ID만 test-only bucket으로 옮긴다.
- `ambiguous`, `not relevant`, 미검토 행은 모두 `walk_unclassified`로 남긴다.
- Transport row·label, HVAC, Place Profile, HOME ranking, recent-purchase grouping은 변경하지 않는다.

Policy B는 계속 비활성 상태로 둔다.

## 7. Human-reviewed hot-weather replay

J의 검토로 익명 Place A와 B는 `walk_short`, Place C는 `walk_sustained`로 확인되었다. 검토표 16건은 15건 short, 1건 sustained였고, 이 ID들만 test-only bucket으로 remap했다. 나머지 역사적 Walk는 계속 `walk_unclassified`로 유지했다. Place A와 B는 exact-context를 합치지 않고 각각 별도 시나리오로 실행했다.

| scenario | Model 0 top 6 | Model 1 unsplit top 6 | Model 2 reviewed split top 6 | changed positions |
|---|---|---|---|---:|
| 33°C, Place A, short Walk | 138, 184, 082, 044, 098, 301 | 138, 044, 098, 301, 316, 275 | 138, 184, 044, 098, 301, 316 | 8 |
| 33°C, Place B, short Walk | same as Place A | same as Place A | same as Place A | 8 |
| 30°C, Place A, short Walk | 138, 184, 368, 082, 087, 189 | 138, 368, 087, 189, 280, 337 | 138, 184, 368, 087, 189, 280 | 21 |
| 30°C, Place B, short Walk | same as Place A | same as Place A | same as Place A | 21 |
| 28°C, Place A, short Walk | 138, 050, 184, 046, 052, 368 | 138, 050, 046, 368, 087, 189 | 138, 050, 184, 046, 368, 087 | 33 |
| 28°C, Place B, short Walk | same as Place A | same as Place A | same as Place A | 33 |
| 33°C, primary cinema, Car | 138, 184, 082, 044, 098, 301 | same | same | 0 |

33°C의 목표 Outfit 184는 unsplit Policy B에서 top 6 밖으로 밀렸지만 reviewed split에서는 두 nearby Place 모두 baseline과 같은 2위로 복귀했다. 따라서 short/sustained 분류가 기존 Walk 증거 오염을 제거해 이 질문에는 긍정적인 답을 주었다.

다만 weak short-Walk 1건만 있는 borrowed-only 후보가 33°C에서 3위에서 10위, 30°C에서 4위에서 23위로 내려갔다. 28°C에서도 weak 1건 후보가 5위에서 36위로 내려갔다. 모두 같은 recommendation level 안의 이동이지만 한 건의 근거가 만드는 하락 폭은 보수적인 수동 QA 후보로 보기 어렵다. Place A와 B의 exact-context count 차이는 존재했지만 supported 후보를 승격하지 않는 Policy B 계약 때문에 두 Place의 top 6 순서는 같았다.

nearby Place에는 historical Car evidence가 없어 두 Car 시나리오는 실행하지 않았다. primary cinema + Car는 Model 0/1/2 전체 순서가 같았다. 각 nearby scenario에서 27개 후보의 range가 inferred return에 민감했지만, top 6와 위의 직접 이동 판단에는 inferred return이 영향을 주지 않았다.

결론적으로 taxonomy split은 원하는 33°C 결과를 복구했지만 weak 1건 감점의 하락 폭이 여전히 과하다. Policy B와 production HOME 통합 flag는 계속 비활성으로 유지한다.
