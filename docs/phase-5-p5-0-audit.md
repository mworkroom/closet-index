# Phase 5 P5-0 Recommendation Evidence Audit

- 실행 시각: 2026-08-06 09:58 KST
- 대상: production project `ddlwainwollvpaeccpty`, 지정 workspace
- 방법: `closet_wear_logs`와 `closet_outfits`의 read-only 조회
- 결과: 783개 source row = 783개 distinct Wear Log, 중복 ID 0개
- 비범위: schema/migration, DB write, Place Profile, HVAC, Item Thermal Observation, UI

> 이 수량은 실행 시점 snapshot이다. 감사 core와 runner는 `npm.cmd run test:phase5-audit`, `npm.cmd run audit:phase5`로 다시 실행할 수 있다.

## 1. 집계 보증

감사 runner는 relation table을 join하지 않는다.

```text
closet_wear_logs 1개 query stream
closet_outfits   1개 query stream
→ Wear Log ID로 중복 제거
→ 순수 분석 core
```

- Wear Log는 `id`별로 한 번만 센다.
- Outfit-Item이나 다른 one-to-many relation row를 Wear Log 수로 세지 않는다.
- 두 query stream은 병렬이며 page size는 1,000이다.
- query 수는 Outfit 수나 카드 수에 비례하지 않는다.
- production write와 migration은 없다.

## 2. Place와 Transport 완전성

| 상태 | Wear Log | 비율 |
|---|---:|---:|
| Place 있음 | 732 | 93.49% |
| Place 없음 | 51 | 6.51% |
| Transport 있음 | 726 | 92.72% |
| Transport 없음 | 57 | 7.28% |
| Place + Transport 모두 있음 | 724 | 92.46% |
| Place만 있고 Transport 없음 | 8 | 1.02% |
| Place 없고 Transport만 있음 | 2 | 0.26% |
| Place + Transport 모두 없음 | 49 | 6.26% |

참고 온도 provenance:

| 상태 | Wear Log | 비율 |
|---|---:|---:|
| `temp_out` 없음 | 154 | 19.67% |
| `temp_back` 없음 | 155 | 19.80% |
| `temp_back_inferred = true` | 501 | 63.98% |

Context 근거는 온도가 없는 Wear Log도 exposure로 사용할 수 있다. 다만 현재 추천 기준선에서 `temp_back_inferred` 501개는 일반 귀가 endpoint처럼 사용되므로, 이번 P5A groundwork에서는 온도 공식을 바꾸지 않고 별도 위험으로 기록한다.

## 3. exact Outfit + Place + Transport 반복 분포

Place와 Transport가 모두 non-null인 Wear Log만 exact group에 포함했다.

| 한 group의 distinct Wear Log 수 | group 수 |
|---:|---:|
| 1 | 596 |
| 2 | 48 |
| 3 | 8 |
| 4 | 2 |
| 합계 | 654 |

## 4. Outfit + Place 반복 분포

Place가 non-null이면 Transport 유무와 관계없이 같은 Outfit + Place group에 포함했다.

| 한 group의 distinct Wear Log 수 | group 수 |
|---:|---:|
| 1 | 595 |
| 2 | 48 |
| 3 | 11 |
| 4 | 2 |
| 합계 | 656 |

## 5. 임계값 1·2·3 비교

### 5.1 exact Outfit + Place + Transport

| 최소 반복 | group | Outfit | 해당 distinct Wear Log | cold group | hot group | issue group | 현재 Error Outfit group |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 654 | 470 | 724 | 63 | 91 | 147 | 28 |
| 2 | 58 | 51 | 128 | 2 | 9 | 9 | 1 |
| 3 | 10 | 10 | 32 | 0 | 1 | 1 | 0 |

### 5.2 Outfit + Place

| 최소 반복 | group | Outfit | 해당 distinct Wear Log | cold group | hot group | issue group | 현재 Error Outfit group |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 656 | 476 | 732 | 63 | 91 | 147 | 28 |
| 2 | 61 | 54 | 137 | 3 | 9 | 10 | 1 |
| 3 | 13 | 13 | 41 | 0 | 1 | 1 | 0 |

### 5.3 판단

- 임계값 1은 exact 654개 중 596개가 singleton이라 반복 습관보다 한 번의 exposure를 대부분 포함한다.
- 임계값 2는 exact 58 group, 51 Outfit, 128 Wear Log를 남겨 실제 비교 fixture와 로컬 비활성 실험을 만들 수 있는 표본이 있다.
- 임계값 3은 exact 10 group, 10 Outfit, 32 Wear Log로 급감해 첫 ranking tier로는 표본이 좁다.
- 따라서 P5A disabled experiment의 초기 최소 반복 임계값은 2로 둔다. production 기본 동작을 켜는 결정은 아니다.
- Outfit + Place threshold 2는 exact보다 3 group, 3 Outfit, 9 Wear Log가 더 있어 Transport가 없거나 다른 경우의 fallback이 실제 추가 정보를 제공한다.

## 6. 반복 맥락 안의 outcome

분류 규칙은 Wear Log별로 상호 배타적이다.

- `exposure`: 맥락에 일치한 모든 distinct Wear Log
- `issue`: 출발 또는 귀가 체감에 `cold`나 `hot`이 하나라도 있음
- `success`: issue가 없고 `ok`가 하나라도 있음
- `unknown`: issue도 success도 없음
- `currentOutfitRatedError`: Wear Log 당시 상태가 아니라 Outfit의 현재 Rating이 `error`

### 6.1 exact 반복 2회 이상에서 issue 또는 현재 Error가 있는 9개 사례

| case | 노출 | success | issue | unknown | cold | hot | 현재 Error |
|---|---:|---:|---:|---:|---:|---:|---|
| case-001 | 2 | 1 | 1 | 0 | 1 | 1 | 아니오 |
| case-002 | 2 | 0 | 2 | 0 | 0 | 2 | 아니오 |
| case-003 | 2 | 1 | 1 | 0 | 0 | 1 | 아니오 |
| case-004 | 2 | 1 | 1 | 0 | 0 | 1 | 아니오 |
| case-005 | 2 | 1 | 1 | 0 | 0 | 1 | 아니오 |
| case-006 | 3 | 2 | 1 | 0 | 0 | 1 | 아니오 |
| case-007 | 2 | 0 | 2 | 0 | 0 | 2 | 아니오 |
| case-008 | 2 | 1 | 1 | 0 | 0 | 1 | 아니오 |
| case-009 | 2 | 0 | 2 | 0 | 1 | 1 | 예 |

`case-001`의 cold와 hot 수 합이 issue 수보다 큰 이유는 같은 Wear Log의 서로 다른 endpoint에서 cold와 hot이 함께 있을 수 있기 때문이다. Wear Log 자체는 issue exposure 1개로만 센다.

### 6.2 Outfit + Place 반복 2회 이상

issue 또는 현재 Error가 있는 사례는 10개다. exact의 9개 외에 Place fallback에서 cold-only issue 1개가 추가된다. threshold 2 group 전체 기준으로 exact는 issue 9/58, Outfit+Place는 issue 10/61이다.

### 6.3 의미

반복은 성공과 동의어가 아니다. exact 2회 이상 group에도 hot/cold issue와 현재 Error Outfit이 존재한다. 따라서 ranking은 단순 반복 횟수 하나가 아니라 동일 structured evidence 안의 exposure·success·issue·unknown을 함께 보존해야 한다. 첫 disabled integration은 반복 tier를 시험하되 기존 온도 위험 level을 절대 넘어설 수 없게 한다.

## 7. 총 Outfit 착용 횟수와 다른 정보인가

감사 결과는 `true`다.

| 검사 | 결과 |
|---|---:|
| 동일 총 착용 횟수를 가진 Outfit이 2개 이상인 cohort | 7 |
| 그중 최대 exact 횟수가 서로 다른 cohort | 7 |
| 그중 최대 Place 횟수가 서로 다른 cohort | 6 |
| exact 맥락이 둘 이상으로 분산된 Outfit | 132 |
| 최대 exact 횟수가 총 착용 횟수보다 작은 Outfit | 140 |

같은 총 착용 횟수여도 특정 Place+Transport에 집중된 정도가 다르고, 한 Outfit의 착용이 여러 맥락으로 분산된다. 따라서 Context evidence는 기존 `wearCount`를 다른 이름으로 반복하는 값이 아니다.

## 8. query multiplication과 N+1 위험

### 감사 runner

- Wear Log와 Outfit의 고정 2 query stream만 사용한다.
- relation join이 없어 Wear Log multiplication이 없다.
- Outfit별 추가 요청이 없어 network N+1이 없다.
- Wear Log ID 중복 방어를 core에 두고 fixture에서 검증했다.

### 현재 앱 snapshot과 추천 계산

- `SupabaseSnapshotRepository.load()`는 공통 snapshot query를 병렬 실행한다.
- Wear Log는 별도 table query라 Outfit-Item relation 수 때문에 증가하지 않는다.
- HOME 카드별 network N+1은 없다.
- 다만 `recommendOutfits`가 Outfit마다 전체 Item과 Wear Log 배열을 반복 탐색하고, 미착용 Outfit은 다른 Outfit까지 다시 비교한다. 이는 query N+1은 아니지만 데이터 증가 시 브라우저 CPU multiplication 위험이다.
- P5A는 현재 `AppData.wearLogs`에서 한 번 계산한 evidence를 재사용해야 하며, UI나 comparator에서 별도 filter를 반복하지 않는다.

## 9. P5A groundwork 결론

1. 초기 반복 임계값은 2로 실험한다.
2. exact tier는 현재 Place와 현재 Transport가 모두 있을 때만 활성화한다.
3. historical null Transport는 exact에 포함하지 않는다.
4. 현재 Transport가 없으면 exact ranking을 비활성화한다.
5. Place-only fallback은 exact에 사용한 Wear Log를 제외해 tier를 상호 배타적으로 유지한다.
6. exposure·success·issue·unknown과 matched Wear Log ID를 동일 evidence object에 보존한다.
7. 기존 온도 level과 거리 뒤에서만 context를 비교한다.
8. local feature flag 기본값은 false로 두고 production 추천은 바꾸지 않는다.

