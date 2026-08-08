# Phase 5 Policy E — Direct Evidence 검증

## 목적과 범위

Policy E는 현재 Place·Transport·온도와 직접 가까운 과거 착용 결과만 추천 순위 근거로 사용할 수 있는지 확인하는 비활성 순수 시뮬레이션이다. HOME, production feature flag, Supabase, Transport/Wear Log 데이터, migration에는 연결하거나 쓰지 않았다.

Policy B는 `overall range는 지원하지만 current-Transport range는 지원하지 않음`을 감점으로 해석해, 실제로는 근거가 없는 후보를 부적합 후보처럼 크게 내렸다. Policy E에서는 borrowed-only를 provenance로만 남기고, 직접 관측이 없으면 항상 neutral인 `unknown`으로 처리한다.

## 직접 근거 모델

- `exactContext`: 같은 Place와 같은 Transport. 순위에 사용할 수 있는 유일한 scope다.
- `currentTransport`: 같은 Transport이지만 다른 Place 또는 혼합 Place. 이번 시뮬레이션에서는 report-only다.
- 현재 Place가 null이면 exact-context ranking을 끈다.
- 현재 Transport가 null이면 모든 Policy E ranking을 끈다.
- 과거 Transport가 null인 Wear Log는 특정 Transport 일치로 세지 않는다.
- departure는 현재 `tempOut`, actual return은 명시적인 현재 `tempBack`과 각각 ±2°C 범위에서만 비교한다.
- 현재 `tempBack`이 null이면 두 번째 endpoint를 만들지 않는다.
- `temp_back_inferred=true` return은 audit provenance에는 남기지만 outcome과 이동에는 쓰지 않는다.
- Wear Log ID 기준으로 중복을 제거하며, 입력 row 순서와 relation multiplication에 독립적인 deterministic 결과를 만든다.

직접 관측 결과는 다음 네 가지다.

- `direct_support`: 관련 OK가 있고 cold/hot은 없음
- `direct_issue`: 관련 cold/hot이 있고 OK는 없음
- `mixed`: 관련 OK와 cold/hot이 함께 있음
- `unknown`: 관련 exact-context 관측 없음

서로 일관된 distinct Wear Log 1건은 `observed-once`, 2건 이상은 `repeated` confidence다. 관측 수는 confidence만 높이며 evidence 방향을 만들지 않는다.

## 비활성 variant

- E0: evidence report-only, 이동 없음
- E1: `direct_issue`만 아래로 이동 가능
- E2: `direct_support`는 위로, `direct_issue`는 아래로 이동 가능

E1과 E2는 무제한 comparator 대신 후보별 최대 1·3·5 position cap을 비교했다. 먼저 기존 추천을 recent purchases, normal recommendations, trial recommendations로 partition한 뒤 각 group 안에서만 이동시켰다. recommendation level 경계, 후보 membership, warnings와 baseline fallback은 보존한다.

## Fixture 결과

필수 시나리오를 포함한 18개 fixture가 통과했다.

- 24°C OK와 더운 target, 더 낮은 온도의 OK 2건은 모두 `unknown`이며 감점되지 않았다.
- 관련 OK 1건은 `direct_support / observed-once`, hot 1건은 `direct_issue / observed-once`였다.
- 관련 OK 2건은 `direct_support / repeated`였다.
- 관련 OK와 hot이 함께 있으면 `mixed`이고 이동하지 않았다.
- 같은 Transport·다른 Place 근거는 `currentTransport` report-only로만 남았다.
- Place null, Transport null, inferred-return-only는 이동하지 않았다.
- actual return은 명시적인 현재 `tempBack`이 있을 때만 평가됐다.
- historical null Transport는 match에서 제외됐다.
- duplicate row와 입력 순서 변화가 evidence와 순위를 바꾸지 않았다.
- recent purchase를 포함한 세 group의 membership은 보존됐다.

## Production SELECT-only matrix

실제 taxonomy를 사용한 고정 SELECT stream으로 익명 10-input matrix를 실행했다. 각 scenario의 전체 후보를 합한 scenario-candidate pair 기준 결과다.

| 합계 | direct support | direct issue | mixed | unknown | observed once | repeated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 inputs | 12 | 5 | 0 | 2,426 | 16 | 1 |

| 익명 입력 | support | issue | mixed | unknown | once | repeated |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 33°C · nearby A · short | 1 | 0 | 0 | 243 | 1 | 0 |
| 33°C · nearby B · short | 0 | 0 | 0 | 244 | 0 | 0 |
| 30°C · nearby A · short | 1 | 2 | 0 | 241 | 3 | 0 |
| 28°C · nearby A · short | 6 | 3 | 0 | 235 | 8 | 1 |
| 30°C · sustained place | 0 | 0 | 0 | 244 | 0 | 0 |
| 26°C · evidence 0 | 0 | 0 | 0 | 245 | 0 | 0 |
| -8°C · Car | 1 | 0 | 0 | 243 | 1 | 0 |
| 26°C · Place null · short | 0 | 0 | 0 | 245 | 0 | 0 |
| 26°C · Transport null | 0 | 0 | 0 | 245 | 0 | 0 |
| 33°C · cinema · Car | 3 | 0 | 0 | 241 | 3 | 0 |

모든 production matrix 입력의 현재 `tempBack`은 null이어서 inferred return에 의한 hypothetical outcome 변화와 실제 ranking adjustment는 모두 0이었다. inferred-return-only 동작은 fixture에서 별도로 검증했다.

## Variant와 movement cap 비교

`directly moved`는 정책 방향이 부여되고 실제 position이 달라진 Outfit 수, `changed positions`는 중립 후보의 밀림까지 포함한 전체 변경 position 수다.

| variant | cap | directly moved | changed positions | maximum movement | group changes |
| --- | ---: | ---: | ---: | ---: | ---: |
| E0 | 1/3/5 | 0 | 0 | 0 | 0 |
| E1 | 1 | 4 | 8 | 1 | 0 |
| E1 | 3 | 5 | 15 | 3 | 0 |
| E1 | 5 | 5 | 19 | 5 | 0 |
| E2 | 1 | 13 | 26 | 1 | 0 |
| E2 | 3 | 14 | 43 | 3 | 0 |
| E2 | 5 | 14 | 52 | 5 | 0 |

E0는 baseline과 동일했다. 움직임이 있는 variant 중 E1 + cap 1이 변경 position 8개로 unrelated churn이 가장 적었다. E2 + cap 1은 support promotion까지 허용하면서 최대 이동을 한 칸으로 제한했지만 26개 position이 달라졌다.

33°C nearby A에서는 E1이 변화를 만들지 않았고, E2는 support 1건 후보를 한 칸 올렸다. nearby B, sustained, evidence 0, Place null, Transport null은 모든 variant에서 변하지 않았다. 두 개의 더 낮은 온도 기록이 직접 부정 근거로 잘못 처리된 경우는 없었다.

## 결론

- production Transport taxonomy는 수집 기준으로 받아들인다.
- Policy B는 rejected disabled experiment로 보존하되 HOME ranking에는 연결하지 않는다.
- borrowed-only와 absence of evidence는 ranking penalty가 아니라 provenance와 neutral 상태다.
- 직접 관련된 관측 1건은 evidence 방향을 만들기에 충분하고, 반복 관측은 confidence만 높인다.
- Policy E engine과 bounded simulator는 local manual QA 후보를 비교할 준비가 됐다.
- 제품 검토 결과 직접 성공 관측을 반영하지 않는 E1 대신 E2 + cap 1을 selected disabled HOME integration candidate로 정했다.
- 다음 별도 audit은 Item-level derived evidence다. 직접 Item observation schema는 P5C 범위이며 이번 단계에서 구현하지 않는다.

## Disabled HOME integration replay addendum

후속 HOME 통합 시점의 production live-data snapshot에서는 E2 cap 1이 11개 Outfit을 직접 이동시키고 전체 22개 position을 바꿨다. 최대 이동은 1, group membership 변화는 0이었다. 이전 13/26 수치는 초기 simulation 당시 snapshot으로 보존한다.

현재 익명 nearby A 33°C baseline은 검토 대상 Outfit을 이미 normal 1위에 두므로 추가 이동이 없었다. nearby A 28°C에서는 의도한 2→1 이동이 유지됐다. cinema + Car 33°C의 2→1 및 6→5 support promotion은 정책 계약에는 맞지만 제품 타당성이 미확정이다.
