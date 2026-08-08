# Phase 5 Policy B Disabled HOME Integration

- 실행일: 2026-08-07 KST
- 상태: local development 전용 flag 뒤에 통합, 기본값 `false`
- production HOME 동작: 변경 없음
- DB 변경: 없음
- 비교 방식: production 6개 table 고정 SELECT stream + 순수 recommendation 계산

## 1. 확정한 Policy B 경계

- current Transport distinct Wear Log 0건은 `unknown`이며 순위 영향이 없다.
- 1건은 weak evidence, 2건 이상은 strong evidence다.
- overall expanded OK range가 target을 지원하지만 current Transport expanded OK range는 지원하지 않고, 다른 non-null Transport가 그 지원을 제공할 때만 감점한다.
- 감점은 기존 `high`, `possible`, `caution` 내부에서만 적용한다.
- 지원되는 후보를 승격하지 않고 Outfit을 제외하지 않는다.
- 기존 endpoint·rain·long-walk warning, 이유 문구, group, level은 변경하지 않는다.
- current Transport가 null이면 Policy B를 적용하지 않는다.
- exact Place + Transport 2건 이상은 cross-Place current Transport 근거보다 높은 confidence로 기록하지만, 지원 후보를 승격하지 않는다.

## 2. Feature flag

`VITE_P5A_TRANSPORT_POLICY_B`는 development build에서 문자열 `true`일 때만 평가된다. production build에서는 값이 있더라도 `import.meta.env.DEV` 조건 때문에 비활성이다.

flag가 없거나 `false`이면 Transport thermal evidence와 Policy B ordering을 계산하지 않고 기존 comparator 결과를 그대로 반환한다. flag가 `true`이면 먼저 기존 comparator로 baseline order를 완성한 뒤, 같은 recommendation level 안에서 Policy B 감점과 baseline index를 차례로 비교한다.

## 3. 합성 fixture 비교

| fixture | baseline | Policy B | 결과 |
|---|---|---|---|
| 33°C + Walk, Walk 1건은 24°C OK, Car가 28·33°C OK | borrowed favorite → supported → unknown | supported → unknown → borrowed favorite | weak borrowed-only 후보만 후순위 |
| 같은 fixture의 current Transport를 Car로 변경 | baseline order | baseline order | current Car range가 target을 지원하므로 무변경 |
| current Transport evidence 0건 | baseline order | baseline order | unknown, 무변경 |
| exactContext 2건 이상 target 지원 | baseline order | baseline order | exact-strong confidence지만 승격 없음 |
| current Transport null | baseline order | baseline order | exact/current Transport ranking 비활성 |

각 feature-on 결과는 배열 순서 외의 `RecommendationResult` 내용이 동일 Outfit의 baseline 객체와 deep equality를 유지한다. feature-off에서는 전체 배열과 partition group까지 deep equality를 유지한다.

## 4. 익명 production 입력 matrix

이번 snapshot은 전체 계절 scope에서 248개 recommendation candidate를 비교했다. 개인 Outfit·Place 라벨은 이 tracked 문서에 기록하지 않았다.

| case | 입력 | ranking 변경 | 직접 감점 | 상위 5위 변화 | 주 evidence |
|---|---|---:|---:|---|---|
| matrix-01 | 33°C, Place A, Walk | 9 | weak 2 | 있음 | 1건·exact 0~1, overall 22~35/19~36, current 22~26/19~23 |
| matrix-02 | 33°C, Place A, Car | 0 | 0 | 없음 | current range가 target 지원 |
| matrix-03 | 26°C, Place A, Transport C | 0 | 0 | 없음 | 248개 모두 current evidence 0 |
| matrix-04 | 28°C, Place B, Car | 224 | weak 1, strong 1 | 없음 | 직접 감점 2개가 level 내부의 큰 간접 이동 유발 |
| matrix-05 | 28°C, Place B, Walk | 35 | weak 2, strong 1 | 있음 | strong 사례 current 3건, overall 19~28, current 19~26 |
| matrix-06 | 23°C, Place B, Walk | 219 | weak 3 | 없음 | 깊은 순위 churn, 상위 5위는 보존 |
| matrix-07 | -8°C, Place B, Car | 0 | 0 | 없음 | 겨울 cold input에서 추가 감점 없음 |
| matrix-08 | 26°C, Place null, Walk | 45 | weak 3 | 있음 | exactContext 비활성, cross-Place Transport만 사용 |
| matrix-09 | 26°C, Place A, Transport null | 0 | 0 | 없음 | Policy B 비활성 |

9개 입력 중 5개에서 순위가 변했고, 순번이 달라진 Outfit position은 합계 532개였다. 이 수치는 직접 감점된 13개뿐 아니라 그 사이에서 한 칸 이상 올라간 후보를 모두 포함한다. 직접 감점은 weak 11개, strong 2개였고 이 중 3개는 inferred return endpoint를 제외하면 range 또는 감점 판단이 달라졌다.

matrix-04에는 exactContext distinct Wear Log 2건 이상이면서 target을 지원하는 후보 2개가 있었다. Policy B는 이 후보를 승격하지 않았고 baseline 순서를 fallback으로 유지했다.

## 5. 판정

개선으로 보이는 결과:

- 33°C Walk에서 current Walk range가 target을 지원하지 않는 상위 후보 2개가 내려가고, current Transport 지원 또는 unknown 후보가 위로 이동했다.
- 같은 입력을 Car로 바꾸면 순서가 유지됐다.
- evidence 0, current Transport null, 겨울 cold case에서 불필요한 순위 영향이 없었다.
- level, warning, reason과 전체 candidate membership은 보존됐다.

의심스러운 결과:

- weak 1건도 같은 level의 모든 무감점 후보 뒤로 이동하므로 2→9, 5→47처럼 큰 하락이 가능하다.
- Place null에서도 cross-Place Transport evidence만으로 상위 후보가 크게 내려갔다.
- 상위 5위가 그대로인 입력에서도 deep-list position이 200개 이상 바뀌어 comparator churn이 크다.
- inferred return endpoint가 직접 감점 13개 중 3개에 영향을 주었다.
- Policy B가 partition 이전 전체 배열을 바꾸므로 동일 구매일 tie에서 `최근 구매 착장`과 `추천 착장` 사이의 group membership도 달라질 수 있다.

따라서 Policy B는 local manual QA 후보로는 검토할 수 있지만 production 활성화 준비가 되지 않았다. flag는 계속 `false`로 유지한다. 다음 판단은 weak evidence의 최대 이동 폭, Place null 처리, inferred endpoint confidence를 별도로 제한할지 검토한 뒤 진행한다.

## 6. 재실행

```powershell
npm.cmd test -- --run src/lib/recommendation.transport-policy-b.test.ts src/lib/transport-thermal-policy.test.ts
$env:RUN_PHASE5_POLICY_B_PRODUCTION='true'
npm.cmd test -- --run scripts/phase5-policy-b-production.test.ts --reporter=verbose
npm.cmd test -- --run
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

production comparison test는 explicit environment gate가 없으면 skip되며, 실행 시에도 SELECT만 수행한다.

## 7. Local HOME manual QA

2026-08-07 authenticated local HOME에서 같은 origin의 development server를 feature-off와 feature-on으로 번갈아 실행해 실제 카드와 pagination을 비교했다. 저장·Wear Log 작성 등 write 동작은 사용하지 않았다.

### 7.1 33°C · Place A · Walk

Feature-off의 일반 추천 첫 3장은 익명 기준 `case-A`, `case-B`, `case-C`였다. Feature-on에서는 `case-C`, `case-D`, `case-E`로 바뀌어, weak borrowed-only인 기존 첫 후보가 첫 화면에서 제거되는 목표 동작을 확인했다. 기존 warning·추천 level·카드 문구는 변하지 않았다.

다만 `최근 구매 착장`의 세 번째 후보도 바뀌었다. Policy B 자체가 최근 구매 group을 직접 정의하지는 않지만, partition 전에 전체 배열을 바꾸고 구매일 tie의 stable order에 영향을 주기 때문이다. 이는 production matrix의 전체 배열 비교만으로는 드러나지 않았던 HOME integration 경계다.

### 7.2 같은 입력을 Car로 변경

Feature-on 상태에서 Transport를 Car로 바꾸자 최근 구매 3장과 일반 추천 3장이 feature-off 순서로 복구됐다. current Car range가 target을 지원할 때 감점하지 않는 계약과 일치한다.

### 7.3 Place null · 26°C · Walk

첫 3장의 일반 추천은 feature-off/on이 같았다. `3개 더 보기`를 실행하면 feature-off의 5번째 weak 후보가 feature-on에서는 첫 6장 밖으로 내려가고 기존 6번째가 5번째로 올라왔다. 따라서 Place null 영향은 초기 3장에는 보이지 않지만 첫 pagination부터 사용자에게 노출된다.

### 7.4 Transport null · 26°C

최근 구매와 일반 추천 첫 3장이 feature-off와 같았다. current Transport null일 때 Policy B가 비활성이라는 계약을 실제 HOME에서도 확인했다.

### 7.5 Rendering과 console

- page title과 HOME identity 정상
- blank page 또는 Vite error overlay 없음
- 입력 변경과 `착장 찾기`, `3개 더 보기` 상호작용 정상
- 관련 console error·warning 0개
- 카드 이미지, rating, wear count, temperature range가 정상 렌더링됨
- Browser viewport override가 실제 390px로 적용되지 않고 1280px를 유지해 mobile-specific breakpoint 검증은 완료하지 못함

Manual QA 뒤에도 Policy B는 disabled를 유지한다. 다음 구현 전에 다음 두 결정을 먼저 내려야 한다.

1. Policy B를 `최근 구매 착장` partition 전에 적용할지, 일반 추천 group 내부에만 적용할지
2. Place null과 weak 1건 evidence가 첫 pagination에서 큰 하락을 만들 수 있도록 허용할지

## 8. Actual Transport taxonomy production replay

2026-08-08 production Transport가 `도보 · 근거리` 88건과 `도보 · 지속` 119건으로 분리된 뒤, test-only remap이 아니라 실제 `transport_mode_id`를 사용하는 matrix를 다시 실행했다. 개인 Place·Outfit 이름은 private console report에만 남기고 이 문서에는 익명 결과만 기록한다.

- 11개 입력 중 ranking이 바뀐 입력: 6개
- 순번이 달라진 Outfit position 합계: 800개
- 33°C short Place A/B: 상위 2개 보존, weak 후보 3→10
- 같은 Place + Car, evidence 0, Transport null, 겨울 cold, cinema + Car: 무변경
- 30°C short: weak 후보 4→23
- 28°C short: strong 2건 후보 5→37
- 30°C sustained: weak 후보 2→24
- Place null short: strong 2건 후보 7→49, 총 43개 position 변경

실제 taxonomy는 short/sustained evidence 오염을 제거하고 33°C nearby 상위 결과를 보존했다. 그러나 감점된 후보를 같은 level의 모든 무감점 후보 뒤로 보내는 현재 comparator 때문에 weak와 strong 모두 큰 하락이 가능하다. Policy B는 계속 disabled로 유지하며, 다음 실험은 1건을 informational-only로 만들고 2건 이상에서도 최대 이동 폭을 제한하는 정책을 먼저 비교한다.

## 9. 최종 disposition

후속 Policy E 검증에서 Policy B의 문제는 weak/strong threshold가 아니라 borrowed-only를 부정 근거로 해석한 데 있음이 확인됐다. `overall range supports`와 `current-Transport range does not support`의 조합은 현재 맥락의 직접 관측이 없다는 뜻이지 Outfit이 부적합하다는 뜻이 아니다.

Policy B 구현과 이 보고서는 rejected disabled experiment로 보존한다. HOME에는 연결하지 않으며, borrowed-only는 이후 정책에서도 provenance로만 유지한다. absence of evidence는 neutral이다.
