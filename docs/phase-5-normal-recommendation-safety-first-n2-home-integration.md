# Phase 5 Safety-first N2 Disabled HOME Integration

## 범위와 상태

Safety-first N2를 normal recommendation 전용의 selected disabled candidate로 연결했다. Recent Purchase는 기존 W2 N3+365일 계약을 그대로 사용한다. Supabase data/schema, migration, Wear Log, Place, Transport, HOME 입력 control과 production 기본 동작은 변경하지 않았다.

- development flag: `VITE_P5A_NORMAL_CONTEXT_N2`
- repository 기본값: `false`
- development에서 문자열 `true`일 때만 활성
- production build에서는 환경값이 `true`여도 `import.meta.env.DEV=false`이므로 강제 비활성
- Policy B, E2, C1, W2 flag와 독립

## 최종 안전 우선 순서

N2는 W2 적용이 끝난 뒤의 final normal recommendation 배열만 다음 순서로 정렬한다.

1. 기존 recommendation level: `high` → `possible` → `caution`
2. 같은 level 안의 context tier: exact support → current-Transport support → cross-context-only → unknown → exact mixed → exact issue
3. 같은 level과 tier 안의 기존 baseline 순서

세 번째 단계는 기존 temperature distance, Rating/Favorite, total Outfit wear count, last worn date, Outfit ID comparator 결과를 그대로 보존한다. Level을 context보다 먼저 두므로 caution exact가 possible 또는 high fallback을 넘을 수 없고, context evidence가 thermal safety를 덮어쓰지 않는다.

## Evidence와 표시 계약

정렬과 카드 표시는 동일한 structured evidence 객체를 공유한다. UI에서 context를 다시 계산하지 않으며 matched Wear Log ID와 endpoint provenance는 객체에 남지만 카드에는 노출하지 않는다.

| Tier | 카드 라벨 |
| --- | --- |
| exact support | `직접 근거 · 이 장소·{Transport}에서 OK` 또는 단일 온도이면 `직접 근거 · 30°C에서 OK 1회` |
| current-Transport support | `같은 이동수단 근거 · 다른 장소` |
| cross-context-only | `다른 조건 근거`, 단일 source Transport이면 `다른 조건 근거 · {Transport} 이동 기록` |
| unknown | `현재 조건 기록 없음` |
| exact mixed | `현재 조건 결과 혼재` |
| exact issue | `현재 조건에서 문제 기록` |

Fallback은 verified support로 표시하지 않는다. Exact mixed와 exact issue는 제거하지 않고 같은 level의 support, fallback, unknown 뒤에 남는다. 기존 warning과 recommendation reason은 그대로 유지한다.

## W2와 partition 보존

통합 순서는 baseline recommendation → 기존 partition → W2 Recent Purchase 재구성 → W2에서 졸업한 observed Outfit의 baseline normal 복귀 → N2 final normal 정렬이다.

- W2 card count, source Item, order와 365일 경계는 N2로 바뀌지 않는다.
- Recent Purchase와 trial 배열은 N2 adapter에서 동일 객체를 보존한다.
- RecommendationResult와 Outfit 객체, level, range, distance, reason, warning, rain·long-walk 판정은 수정하지 않는다.
- Place 또는 Transport가 없으면 N2를 적용하지 않고 baseline normal 배열과 무라벨 상태를 유지한다.
- Feature off는 전달받은 partition 객체와 세 배열을 그대로 반환한다.

## 익명 production SELECT-only 비교

2026-08-08 KST snapshot의 기존 다섯 입력을 다시 읽어 비교했다. 실제 label과 Wear Log ID는 추적 문서에 기록하지 않았다.

| 입력 | normal 후보 | exact / Transport / cross / unknown | issue / mixed | 이동 후보 / 절대 rank 이동 | 손실 |
| --- | ---: | --- | --- | ---: | ---: |
| nearby A · short · 28°C | 238 | 6 / 0 / 28 / 201 | 3 / 0 | 214 / 1212 | 0 |
| nearby A · short · 30°C | 240 | 1 / 0 / 23 / 214 | 2 / 0 | 221 / 828 | 0 |
| nearby A · short · 33°C | 240 | 1 / 0 / 8 / 231 | 0 / 0 | 3 / 4 | 0 |
| sustained A · sustained · 30°C | 240 | 0 / 0 / 24 / 216 | 0 / 0 | 3 / 4 | 0 |
| cinema A · Car · 33°C | 240 | 3 / 6 / 0 / 231 | 0 / 0 | 7 / 20 | 0 |

Nearby 30°C의 exact high 후보는 baseline 20위에서 N2 1위, nearby 33°C의 exact high 후보는 3위에서 1위가 됐다. Nearby 28°C에서는 exact high 후보 다섯 장이 1–5위이고 high fallback이 6위였다. 별도의 caution exact 후보는 모든 high와 possible 뒤에 남았다. Cinema + Car 33°C에서는 exact high 세 장이 1–3위, 같은 Transport·다른 Place high 세 장이 4–6위였다.

다섯 입력 합계로 448개 candidate-position이 바뀌었고 절대 rank 이동 합은 2068이었다. 이는 candidate 제거가 아니라 같은 level 안에서 큰 unknown pool과 명시적 fallback tier를 분리한 결과다. Candidate loss, W2 difference, inferred-return ranking effect는 모두 0이었다. `longWalkCondition`을 바꾼 replay에서도 context state와 tier가 같았다.

## 인증 HOME QA

같은 인증된 `127.0.0.1:5173` origin에서 W2=true, N2=true, Policy B/E2/C1=false 조합과 N2=false baseline을 순차 확인했다.

- 28·30·33°C nearby short, 30°C sustained, 33°C cinema + Car의 top six가 SELECT-only 결과와 일치했다.
- Nearby 30°C와 33°C의 exact high 후보가 각각 normal rank 1이었다.
- Nearby 28°C에서 exact high 다섯 장이 fallback보다 앞섰고 caution은 high/possible 위로 올라오지 않았다.
- Sustained 입력에는 exact/current-Transport support가 없어 top six가 fallback 라벨로만 표시됐다.
- Cinema + Car에서는 exact 세 장, current-Transport 세 장 순으로 표시됐다.
- Place null과 Transport null은 baseline top six와 같고 context 라벨이 없었다.
- 28°C W2 Recent Purchase 두 장의 membership과 순서는 N2 off/on에서 같았고 나머지 네 입력은 모두 0장으로 같았다.
- Desktop 1280×720과 mobile 390×844에서 카드가 렌더링됐고 mobile horizontal overflow는 없었다. 짧은 evidence label은 좁은 카드에서 최대 두 줄이었다.
- Feature on/off 모두 console warning/error가 0건이었다.

## 결론

Safety-first N2는 local opt-in QA를 마쳤고 계약상 production 활성화 후보로 준비됐다. 다만 이 변경에서는 flag를 켜지 않았으며 production 동작은 baseline 그대로다. 실제 사용에서 28°C와 30°C처럼 다수 후보의 deep rank가 크게 재배열되는 것이 탐색 경험에 적절한지 확인한 뒤 별도 승인으로 활성화해야 한다.

N1은 결과가 지나치게 희소해 rejected control로 유지한다. Policy B는 rejected, E2는 historical comparison, W2는 selected Recent Purchase candidate다. HVAC와 Place Profile은 이 ranking과 분리된 future improvement다.
