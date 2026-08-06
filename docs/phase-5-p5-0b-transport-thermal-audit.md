# Phase 5 P5-0B Transport-conditioned Thermal Evidence Audit

- 실행 시각: 2026-08-06 21:18 KST
- 대상: production project의 `closet_wear_logs`, `closet_outfits`
- 방식: 기존 P5-0 runner를 확장한 read-only SELECT와 순수 계산
- 입력: 783 source row = 783 distinct Wear Log, Outfit 503개
- 비변경: migration, schema, HOME 추천 결과·comparator·feature flag, Place Profile, HVAC, Item Thermal Observation

> 이 문서는 기존 [P5-0A 감사](./phase-5-p5-0-audit.md)를 대체하지 않는다. 새로 발견된 Transport-conditioned thermal failure를 별도 질문으로 검증한 P5-0B snapshot이다.

## 1. 범위와 비범위

이번 감사는 같은 Outfit의 온도 관측을 모든 Transport에 합쳤을 때 overall OK 범위나 cold/hot 경고가 다른 Transport의 기록을 빌리는 빈도와 provenance를 측정한다. 계산 결과는 사실과 출처만 담고 warning·deprioritize·exclude 중 어느 정책을 적용할지는 결정하지 않는다.

HOME 추천 경로에는 연결하지 않았다. 기존 추천이 사용하는 inferred 귀가 endpoint, ±2°C 범위, endpoint 경고도 바꾸지 않았다. production에서는 두 table을 고정된 두 query stream으로 읽었고 write는 수행하지 않았다.

## 2. 익명화한 실제 실패 패턴

`case-001`의 합성 fixture는 다음 기록을 사용한다.

| Outfit | 온도 | Transport | 체감 |
|---|---:|---|---|
| Outfit A | 24°C | Walk | OK |
| Outfit A | 28°C | Car | OK |
| Outfit A | 33°C | Car | OK |

현재 입력이 33°C + Walk이면 overall expanded OK range는 22–35°C지만 Walk range는 22–26°C다. 따라서 overall은 target을 지원하지만 current Transport는 지원하지 않고, 33°C endpoint의 matched Wear Log는 Car group에서 추적된다. 같은 입력의 Transport가 Car이면 Car range는 26–35°C이고 target을 지원한다.

이 fixture는 정책을 주장하지 않는다. 특히 `longWalkCondition`은 Transport evidence를 대신하지 않으며 계산 결과에도 영향을 주지 않는다.

## 3. 계산 정의

- 출발 관측: `temp_out`과 `feeling_out`이 모두 있는 endpoint
- 귀가 관측: `temp_back`과 `feeling_back`이 모두 있는 endpoint
- 동일 Wear Log 안에서 온도와 체감이 같은 출발·귀가 endpoint는 한 번만 계산
- baseline-compatible pass: 현재 추천과 같이 `temp_back_inferred = true`인 귀가 endpoint도 포함
- higher-confidence pass: 출발은 유지하고 inferred 귀가 endpoint만 제외
- raw OK range: OK 관측의 최솟값부터 최댓값
- expanded OK range: raw range의 양 끝에 기존 2°C를 추가
- target temperature: `(tempOut + (tempBack ?? tempOut)) / 2`
- cold endpoint warning: 현재 출발 또는 귀가 온도가 과거 cold 관측 온도 이하
- hot endpoint warning: 현재 출발 또는 귀가 온도가 과거 hot 관측 온도 이상
- 다른 Transport endpoint borrowing: overall raw endpoint가 current Transport보다 넓고, 그 endpoint를 다른 non-null Transport가 제공하며 null Transport가 같은 endpoint를 제공하지 않는 경우
- cross-Transport conflict: 같은 Outfit, 서로 다른 non-null Transport, 온도 차이 2°C 이하에서 OK와 cold/hot 또는 cold와 hot이 충돌하는 관측 쌍

각 evidence summary는 observation, raw/expanded OK range, cold/hot 온도, distinct matched Wear Log ID, observation 수, distinct Wear Log 수, 최신 `wornOn`을 보존한다. current·other·null Transport는 별도 bucket이며, 현재 Transport가 null이면 current bucket 자체가 없다.

## 4. baseline-compatible 결과

### 4.1 데이터 가용성

| 항목 | 수량 |
|---|---:|
| thermal observation | 831 |
| thermal observation이 있는 distinct Wear Log | 629 |
| thermal observation이 있는 Outfit | 398 |
| non-null Transport가 2종 이상인 Outfit | 50 |
| Outfit + non-null Transport group | 445 |
| null-Transport thermal observation | 17 |
| null-Transport distinct Wear Log | 13 |

Transport group의 distinct Wear Log 분포는 1회 331개, 2회 75개, 3회 27개, 4회 8개, 5회 2개, 6회 2개다. 최소 1·2·3회 threshold에서 남는 group은 각각 445·114·39개다.

## 5. inferred-temperature 민감도

| 항목 | baseline | inferred 귀가 제외 | 변화 |
|---|---:|---:|---:|
| thermal observation | 831 | 755 | -76 |
| thermal Outfit | 398 | 398 | 0 |
| non-null Transport 2종 이상 Outfit | 50 | 50 | 0 |
| null-Transport observation | 17 | 13 | -4 |
| threshold 1 overall range 확장 pair | 81 | 72 | -9 |
| threshold 2 overall range 확장 pair | 18 | 18 | 0 |
| threshold 3 overall range 확장 pair | 5 | 5 | 0 |
| cross-Transport conflict | 18 | 17 | -1 |

inferred 귀가 76개를 제외해도 multi-Transport Outfit 수와 threshold 2·3의 range 확장 결론은 유지된다. threshold 1의 range 확장 수는 줄지만 broader pattern은 사라지지 않는다. warning borrowing 수는 모든 threshold에서 같았다.

## 6. range borrowing 결과

### 6.1 baseline-compatible

| current Transport 최소 distinct Wear Log | pair | high endpoint borrowing | low endpoint borrowing | overall expanded range가 current보다 넓음 |
|---:|---:|---:|---:|---:|
| 1 | 445 | 44 | 39 | 81 |
| 2 | 114 | 10 | 7 | 18 |
| 3 | 39 | 3 | 2 | 5 |

threshold 1에서 current보다 넓어진 pair는 81/445(18.20%), threshold 2는 18/114(15.79%), threshold 3은 5/39(12.82%)다. 계산 가능한 borrowed high endpoint 차이는 평균 4.17°C, 최대 13°C였고 low endpoint 차이는 평균 3.84°C, 최대 8°C였다. current Transport에 OK range가 전혀 없는 pair는 차이 크기 평균에서 제외했다.

endpoint source의 Place 관계는 threshold 1에서 high 44건 중 same Place 3건·different Place 41건, low 39건 중 same Place 2건·different Place 37건이었다. 따라서 range borrowing 자체는 넓게 존재하지만 대부분은 Place 차이와 함께 나타나 HVAC 등 confounder를 분리할 수 없다.

### 6.2 higher-confidence

| 최소 distinct Wear Log | high endpoint borrowing | low endpoint borrowing | overall expanded range가 current보다 넓음 |
|---:|---:|---:|---:|
| 1 | 42 | 39 | 72 |
| 2 | 12 | 7 | 18 |
| 3 | 4 | 2 | 5 |

inferred endpoint 제거로 어떤 current range endpoint도 함께 사라질 수 있어 high borrowing 수가 threshold 2·3에서 각각 2건·1건 늘었다. 이는 sensitivity pass가 baseline의 단순 부분집합 count가 아니라 range 경계 재계산임을 뜻한다.

## 7. warning borrowing 결과

current endpoint-warning semantics에서 다른 Transport만이 더 넓은 warning boundary를 제공하는 Outfit + Transport pair는 다음과 같다.

| 최소 distinct Wear Log | cold boundary | hot boundary |
|---:|---:|---:|
| 1 | 9 | 16 |
| 2 | 2 | 4 |
| 3 | 1 | 2 |

inferred 귀가 endpoint를 제외해도 이 수치는 변하지 않았다. 순수 calculator는 실제 입력 endpoint별로 current·other·null Transport source Wear Log ID를 분리해 보존한다. 감사 보고서는 private ID 대신 수량만 노출한다.

## 8. same-Place와 different-Place 충돌

baseline에서는 cross-Transport conflict observation pair 18건, distinct Outfit 13개가 발견됐다.

| Place 관계 | baseline | inferred 귀가 제외 |
|---|---:|---:|
| same Place | 0 | 0 |
| different Place | 18 | 17 |
| 한쪽 이상 Place null | 0 | 0 |

`case-001`부터 `case-018`까지는 온도 차이 0–2°C의 익명 관측 쌍이며 모두 different Place였다. 이는 서로 다른 Transport에서 outcome이 달라지는 현상이 존재한다는 증거지만, 같은 Place 통제가 없으므로 Transport 효과의 강한 인과 증거로 해석할 수 없다. 반면 range endpoint source에는 소수의 same-Place 사례가 있어 후속 fixture 검토 후보는 존재한다.

## 9. 한계

- Wear Log는 관측 데이터이며 Transport가 outcome 차이의 원인임을 증명하지 않는다.
- different Place 사례는 HVAC, 체류 시간, 활동량, 계절·습도 등의 영향을 함께 포함할 수 있다.
- current `longWalkCondition`은 신발 적합성 입력이며 이동 중 열 노출 시간을 나타내는 thermal feature가 아니다.
- baseline은 inferred 귀가 온도를 실제 endpoint처럼 사용한다. sensitivity pass는 영향만 측정하며 production 동작을 바꾸지 않는다.
- threshold는 evidence 양을 나눠 보는 분석 축이지 추천 정책이 아니다.
- conflict는 observation pair 기준이므로 한 Outfit에 여러 충돌 관측이 있을 수 있다.

## 10. 결론

실패 fixture의 핵심 현상인 “overall OK range가 다른 Transport의 endpoint를 빌려 current Transport보다 넓어짐”은 production snapshot에서도 확인됐다. threshold 2에서도 114 pair 중 18 pair의 overall expanded range가 current Transport range보다 넓었다. 다만 same-Place conflict는 0건이고 borrowing endpoint 대부분도 different Place여서, broader data가 곧바로 Transport-conditioned exclude 정책을 지지한다고 말할 수는 없다.

따라서 P5A-1의 다음 경계는 HOME 통합이 아니라 정책 없는 evidence review다. current Transport별 range·warning provenance를 fixture와 익명 사례에서 검토하고, Place confounder와 최소 evidence threshold를 정한 다음 warning·deprioritize·exclude 중 하나를 별도로 결정해야 한다.

## 11. 미확정 제품 결정

- overall만 지원하고 current Transport가 지원하지 않을 때 warning·deprioritize·exclude 중 무엇을 적용할지
- current Transport evidence가 0·1·2·3건일 때 overall fallback을 어디까지 허용할지
- 같은 Place evidence를 필수로 요구할지, different Place를 낮은 신뢰도로 사용할지
- null Transport와 inferred return endpoint의 production 신뢰도
- cold/hot warning provenance가 다른 Transport뿐일 때 기존 warning을 유지할지
- Transport thermal 판단과 P5A-2 context familiarity ranking의 정확한 선후 관계

## 12. 재실행 명령

```powershell
npm.cmd test -- --run src/lib/transport-thermal-evidence.test.ts
npm.cmd run test:phase5-audit
npm.cmd test -- --run src/lib/recommendation.test.ts src/lib/recommendation.phase5-baseline.test.ts src/lib/recommendation.context-ranking.test.ts src/lib/context-evidence.test.ts
npm.cmd run typecheck
npm.cmd run audit:phase5
git diff --check
npm.cmd test -- --run
```

`audit:phase5`는 local Supabase 환경 변수를 읽어 production SELECT만 수행한다. migration이나 write 명령은 포함하지 않는다.

## 13. P5A-1 same-Place review와 disabled 정책 비교

2026-08-06 후속 review에서 calculator scope를 `overall`, `currentTransport`, `currentPlace`, `exactContext`, `nullTransport`로 확장했다. 아래 수치는 동일 Place에서 다른 Transport가 overall endpoint 또는 warning boundary를 제공한 익명 context case다.

| current Transport 최소 distinct Wear Log | high | low | cold warning | hot warning | 합계 |
|---:|---:|---:|---:|---:|---:|
| 1 | 3 | 2 | 1 | 0 | 6 |
| 2 | 2 | 0 | 0 | 0 | 2 |
| 3 | 1 | 0 | 0 | 0 | 1 |

6개 baseline-compatible case 중 direct conflict는 0개였다. 5개는 exactContext distinct Wear Log가 1개뿐이었고, 1개만 exactContext 2개를 가졌다. 1개 low-endpoint case는 inferred return endpoint의 영향을 받았지만, 이를 제외한 higher-confidence pass에서도 종류별 case 수는 동일했다. 실제 Outfit·Place·Transport 이름은 이 tracked report에 기록하지 않았다.

Policy 영향 수는 555개 Outfit + Place + Transport context에서 overall raw OK endpoint가 다른 Transport에 의해서만 지원되는 scenario를 대상으로 계산했다. 이는 전체 추천 결과 변경 수가 아니라 borrowed-target context pair 수다.

| Disabled policy | baseline affected pair | inferred 귀가 제외 | 33°C Walk fixture |
|---|---:|---:|---|
| A — report only | 0 | 0 | provenance만 보고, 순위 영향 없음 |
| B — weak 1 / strong 2 | 61 | 56 | current Walk 1건을 weak borrowed-only로 표시하고 같은 level 안에서 후순위 후보 |
| C — minimum 2 only | 20 | 20 | Walk 1건은 informational이므로 순위 영향 없음 |
| D — exact context only | 3 | 3 | exactContext 1건이므로 순위 영향 없음 |

Policy D가 unrelated context에 미치는 영향은 가장 작지만 실제 33°C Walk failure를 다루지 못한다. Policy B만 해당 fixture를 직접 다루며, 영향 범위가 가장 넓으므로 production 채택이 아니라 disabled comparison 후보로만 남긴다. 모든 policy는 기존 `high > possible > caution` 경계와 기존 comparator fallback을 보존하고 Outfit을 제외하지 않는다.

이번 후속 review에서도 production HOME 추천 결과, comparator, warning, feature flag는 변경하지 않았다. warning·deprioritize 정책은 미확정이며 hard exclusion은 현재 audit에서 지지되지 않는다.
