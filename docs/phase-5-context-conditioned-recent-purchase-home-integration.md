# Phase 5 Context-conditioned Recent Purchase C1 + N3 HOME Integration

## 범위와 상태

Recent Purchase 전용 C1 exact-context eligibility와 N3 novelty-source selection을 기존 HOME 추천·partition 경로 뒤에 얇은 adapter로 연결했다. 새 추천 모델이나 별도 simulation framework는 만들지 않았으며, 기존 context calculator와 N3 selector를 그대로 호출한다.

development 전용 flag는 `VITE_P5A_RECENT_PURCHASE_C1_N3`다.

- 기본값은 `false`다.
- `import.meta.env.DEV === true`이면서 값이 문자열 `true`일 때만 동작한다.
- production build에서는 환경값이 `true`여도 강제로 비활성이다.
- Policy B와 Policy E2 flag에서 독립되어 있다.

HOME 문구, control, recommendation reasons·warnings, Supabase data/schema와 migration은 변경하지 않았다.

## C1 + N3 계약

Place와 Transport가 모두 선택된 경우 Recent Purchase Outfit은 다음 조건을 모두 만족해야 한다.

1. 같은 Place와 같은 Transport의 역사 Wear Log다.
2. 해당 current endpoint와 역사 endpoint가 ±2°C 안이다.
3. 관련 OK 관측이 한 건 이상 있다.
4. 관련 cold/hot 관측은 없다.
5. 상태가 `exact_support`다.

`exact_issue`, `exact_mixed`, `current_transport_support`, `cross_context_only`, `unknown`, `untried`는 Recent Purchase에 포함하지 않는다. inferred return endpoint는 provenance와 sensitivity count에만 남고 support를 만들지 않는다. historical null Transport는 선택된 Transport와 일치하지 않는다.

C1을 통과한 Outfit에는 N3를 적용한다.

- `Item.acquiredOn`을 최초 구매 또는 handmade completion novelty date로 사용한다.
- Purchase Event와 replenishment는 HOME에서 추가 조회하지 않고 novelty를 reset하지 않는다.
- exact normalized category `Top-T-shirts-innerwear`는 source가 될 수 없지만, 같은 Outfit의 다른 유효 Item은 source가 될 수 있다.
- source Item당 최대 한 장, Outfit당 최대 한 장만 선택한다.
- source Item별로 기존 baseline rank가 가장 높은 Outfit을 고른다.
- 세 개의 distinct source Item을 선택하거나 유효 source가 끝나면 멈춘다.

따라서 Recent Purchase는 정확히 세 장이 아니라 0–3장이다. 부족한 자리를 다른 문맥, unknown, 중복 Item 또는 중복 Outfit으로 채우지 않는다.

## Partition 보존

기존 `recommendOutfits`와 `partitionRecommendations`를 먼저 실행한다.

- flag off: 기존 partition 객체와 세 배열을 그대로 반환한다. 값의 deep equality뿐 아니라 보장된 object·array identity도 유지한다.
- flag on + 완전한 context: C1+N3로 recent ID set을 다시 만들고, 선택되지 않은 모든 observed Outfit을 원래 baseline 결과 순서대로 normal recommendations에 둔다.
- trial recommendations: 기존 배열 identity와 membership·order를 그대로 유지한다.
- Place 또는 Transport가 null: 이번 실험에서는 현재 C0 partition 객체를 그대로 반환한다.

missing-input C0 fallback은 다른 제품 결정을 섞지 않기 위한 compatibility 선택이다. 장기적으로 section을 숨길지 C0를 유지할지는 별도 제품 결정으로 남는다.

## Production SELECT-only 비교

실제 이름은 tracked 문서에 기록하지 않고 익명 scenario와 Outfit 역할로만 남긴다.

| 입력 | 기존 C0 카드 | C1 + N3 카드 | 제외된 기존 카드 | 후보 유실 | 중복 source / Outfit |
| --- | ---: | ---: | ---: | ---: | ---: |
| nearby A · 26°C · short | 3 | 3 | 3 | 0 | 0 / 0 |
| nearby A · 28°C · short | 3 | 3 | 3 | 0 | 0 / 0 |
| nearby A · 30°C · short | 3 | 1 | 3 | 0 | 0 / 0 |
| nearby A · 33°C · short | 3 | 1 | 2 | 0 | 0 / 0 |
| cinema A · 33°C · Car | 3 | 3 | 2 | 0 | 0 / 0 |
| Place null · 33°C · short | 3 | 3 C0 fallback | 0 | 0 | 0 / 0 |
| nearby A · 33°C · Transport null | 3 | 3 C0 fallback | 0 | 0 | 0 / 0 |

근거리 33°C에서 감사 대상 lightweight outer Outfit은 `cross_context_only`이므로 Recent Purchase에서 빠지고 normal recommendations의 기존 baseline 위치로 돌아간다. 같은 Outfit은 cinema A + Car 33°C에서 observed departure 31°C OK 한 건으로 `exact_support`가 되어 Recent Purchase에 남는다. inferred return 관측은 두 판단 모두에 영향을 주지 않았다.

26°C와 28°C는 exact support source가 세 개 이상이지만, 30°C와 33°C는 각각 한 개뿐이었다. 빈 두 자리는 채우지 않았다. 모든 입력에서 feature-off deep equality, trial identity, candidate loss 0, duplicate source 0, duplicate Outfit 0을 확인했다.

## Fixture와 렌더링

integration fixture 24개가 3·2·1·0장, context state, inferred return, null Transport, source/Outfit dedup, repurchase novelty, innerwear source exclusion, missing-input fallback, normal 복귀, trial 보존, feature-off identity, production forced-false와 duplicate/input-order determinism을 고정한다.

기존 Recent Purchase 마크업을 동작 변경 없이 작은 section component로 분리해 0·1·2·3장 렌더링을 직접 검사했다.

- 0장: 현재 convention대로 section 자체를 렌더링하지 않는다.
- 1·2·3장: 실제 카드 수만 렌더링하며 placeholder가 없다.
- 1440×1000 desktop과 390×844 mobile에서 7개 인증 scenario를 feature off/on으로 확인했다.
- 모든 실제 viewport에서 horizontal overflow가 없었고 console warning/error는 0건이었다.
- 현재 grid는 variable count를 이미 처리하므로 CSS는 변경하지 않았다.

## 결론과 미확정 항목

C1 + N3는 기존 pipeline을 보존하면서 “선택한 Place·Transport·유사 온도에서 직접 성공한 최근 구매 Outfit만 표시한다”는 계약을 충족한다. 선택된 disabled candidate로 유지하고 명시적인 local QA에는 사용할 수 있다.

아직 local default 또는 production에 활성화할 준비가 되었다고 판단하지 않는다. 30°C와 33°C에서 한 장만 보이는 strict 결과를 J가 실제 사용 흐름에서 수용하는지, missing input에 C0를 영구 유지할지, source Item과 matched Wear Log provenance를 향후 어떤 wording으로 설명할지를 먼저 결정해야 한다.
