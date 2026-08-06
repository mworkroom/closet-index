# Phase 5 현재 HOME 추천 파이프라인 지도

- 기준일: 2026-08-06
- 범위: Phase 5 P5-0 착수 시점의 코드 기준선
- 목적: P5A 실험 전 현재 추천 결과와 설명이 어디서, 어떤 순서로 만들어지는지 고정
- 비범위: schema 변경, Place Profile, HVAC, Item Thermal Observation, UI 변경

## 1. 전체 흐름

```text
SupabaseSnapshotRepository.load()
  ├─ Item / Outfit / Outfit-Item / Wear Log / Place / Transport 병렬 조회
  └─ Outfit-Item relation을 Outfit.itemIds로 조립
          ↓
DataContext의 AppData snapshot
          ↓
useHomeRecommendation
  ├─ 활성 Season에 맞는 Outfit만 남김
  ├─ 수동 입력 또는 명시적으로 적용한 날씨 입력을 RecommendationInput으로 확정
  └─ recommendOutfits(scopedData, submitted)
          ↓
recommendOutfits
  ├─ 추천 불가 Outfit 필터
  ├─ Outfit별 직접 Wear Log 및 미착용 Outfit의 유사 착장 근거 계산
  ├─ 온도 적합성, 위험 경고, 설명 계산
  └─ 현재 기준선 comparator로 결정적 정렬
          ↓
partitionRecommendations
  ├─ 최근 구매 착장
  ├─ 직접 착용 근거가 있는 추천
  └─ 온도가 맞는 시험 착장
          ↓
HomePage가 RecommendationResult.reasons / warnings를 그대로 표시
```

## 2. 소스 파일과 책임

| 파일 | 현재 책임 |
|---|---|
| `src/data/supabase/snapshot.ts` | HOME을 포함한 공통 `AppData` snapshot 조회와 Outfit-Item relation 조립 |
| `src/data/supabase/shared.ts` | Supabase Wear Log row를 앱의 `WearLog`로 변환 |
| `src/context/DataContext.tsx` | repository snapshot을 로드하고 HOME에 제공 |
| `src/features/home/useHomeRecommendation.ts` | 입력 보존, 날씨 적용, Season scope, 추천 호출, pagination 상태 |
| `src/lib/weather-recommendation.ts` | 날씨 응답을 기존 `RecommendationInput`으로 변환 |
| `src/lib/seasons.ts` | 활성 Season과 Outfit 구성 Item의 계절 일치 판정 |
| `src/lib/recommendation.ts` | 후보 필터, 온도 근거, 경고, 유사 착장 근거, 이유, 정렬, HOME 그룹 분리 |
| `src/lib/types.ts` | `RecommendationInput`, `WearLog`, `RecommendationResult` 계약 |
| `src/pages/HomePage.tsx` | 입력 UI와 계산 완료된 `reasons`, `warnings` 표시 |
| `src/lib/recommendation.test.ts` | 현재 추천 계산의 기존 단위 회귀 테스트 |
| `src/lib/weather-recommendation.test.ts` | 수동 입력과 날씨 입력의 추천 계약 회귀 테스트 |

## 3. 데이터 조회 경계

`SupabaseSnapshotRepository.load()`는 다음 요청을 `Promise.all`로 병렬 실행한다.

1. `closet_items`
2. `closet_outfits`
3. `closet_outfit_items` — 1,000행 단위 pagination
4. `closet_wear_logs`
5. `closet_places`의 active row
6. `closet_transport_modes`의 active row
7. `closet_weather_locations`
8. ready image asset 조회

추천을 위해 별도의 Outfit별 네트워크 요청은 하지 않는다. Wear Log는 relation join 없이 `closet_wear_logs`의 각 row를 한 번씩 가져오며, Outfit-Item relation은 별도 결과를 `outfit_id`별로 묶어 `Outfit.itemIds`로 만든다. 따라서 현재 조회 경계에는 추천 카드 수에 비례하는 네트워크 N+1은 없다.

다만 추천 계산 내부에는 반복 탐색 비용이 있다.

- Outfit마다 `data.items.find(...)`로 구성 Item을 찾는다.
- Outfit마다 전체 `data.wearLogs.filter(...)`로 직접 기록을 찾는다.
- 미착용 Outfit마다 다른 Outfit과 Wear Log를 다시 훑어 유사 근거를 만든다.

이는 query multiplication은 아니지만 Outfit·Wear Log가 늘수록 브라우저 CPU 비용이 커질 수 있는 구조다.

## 4. HOME 입력과 날씨 적용

`RecommendationInput`은 다음 값을 가진다.

- `tempOut`: 필수 정수
- `tempBack`: 선택 정수. 비어 있으면 추천 계산에서 `tempOut`을 사용
- `rainCondition`
- `longWalkCondition`
- `placeId`
- `transportModeId`

날씨 조회 성공만으로 숨은 추천 입력이 생기지 않는다. HOME에서 날씨를 명시적으로 적용하면 `recommendationInputFromWeather()`가 출발·귀가 온도와 강수 조건을 기존 입력 계약으로 변환한다. 날씨 실패 시 수동 입력은 계속 사용할 수 있다.

HOME은 제출 전 상태와 제출된 `RecommendationInput`을 구분한다. 추천은 `submitted`가 있을 때만 다시 계산된다. 입력은 같은 KST 날짜에 한해 local/session storage에서 복원된다.

## 5. 후보 필터

추천 계산 전후의 필터 순서는 다음과 같다.

1. `useHomeRecommendation`에서 활성 Season에 맞지 않는 Outfit을 제외한다.
2. `recommendOutfits`에서 `archivedAt`이 있는 Outfit을 제외한다.
3. 현재 Rating이 `error`인 Outfit을 제외한다.
4. 유효한 구성 Item이 하나도 없는 Outfit을 제외한다.
5. 구성 Item 중 하나라도 `retired`이면 제외한다.

Rating `error`는 Wear Log별 결과가 아니라 현재 Outfit 상태다. 따라서 과거 특정 착용일이 언제 `error`였는지는 현재 데이터만으로 알 수 없다.

## 6. 온도 관측과 적합 범위

### 6.1 관측 생성

직접 Wear Log마다 다음 endpoint를 온도 관측으로 만든다.

- `temp_out`과 `feeling_out`이 모두 있으면 출발 관측 1개
- `temp_back`과 `feeling_back`이 모두 있으면 귀가 관측 1개
- 한 Wear Log 안에서 출발·귀가의 온도와 체감이 모두 같으면 중복 1개를 제거

온도나 체감이 없으면 해당 endpoint는 온도 근거에서 제외된다. 그러나 Wear Log 자체는 착용 횟수, 최근 착용일, Place·Transport 설명에는 계속 사용된다.

현재 구현은 `temp_back_inferred`를 관측 필터나 가중치에 사용하지 않는다. `temp_back` 값과 `feeling_back`이 있으면 추론 여부와 무관하게 일반 귀가 관측처럼 반영한다. P5A groundwork는 이 기준선을 바꾸지 않는다.

### 6.2 OK 범위와 ±2°C

직접 관측 중 `feeling === 'ok'`인 온도의 최솟값과 최댓값을 구한 뒤 양쪽에 2°C를 더한다.

```text
okRange.min = min(OK 온도) - 2
okRange.max = max(OK 온도) + 2
```

현재 목표 온도는 다음 평균이다.

```text
tempBackForCalculation = tempBack ?? tempOut
targetTemp = (tempOut + tempBackForCalculation) / 2
```

`targetTemp`와 `okRange`의 거리는 범위 안이면 0, 밖이면 가장 가까운 경계까지의 차이다.

### 6.3 추천 단계

- 경고가 하나라도 있거나 `okRange` 밖 거리가 2°C 초과면 `caution`
- 경고가 없고 거리가 0이면 `high`
- 경고가 없고 거리가 0°C 초과 2°C 이하면 `possible`

따라서 단일 OK 20°C 기록의 직접 `okRange`는 18~22°C다. 경고가 없다는 전제에서 목표 18~22°C는 `high`, 16~17°C와 23~24°C는 `possible`, 그 밖은 `caution`이다. 이 두 번째 2°C 구간은 OK 범위를 확장하는 규칙이 아니라 현재 level 판정의 거리 허용 구간이다.

## 7. endpoint 경고

평균 온도와 별개로 출발·귀가 endpoint 각각을 과거 `cold`·`hot` 관측과 비교한다.

- 현재 endpoint가 과거 `cold` 관측 온도 이하이면 추움 경고
- 현재 endpoint가 과거 `hot` 관측 온도 이상이면 더움 경고
- 한 endpoint에서 두 조건이 동시에 가능하면 코드 순서상 추움 경고를 먼저 반환
- 귀가 온도 미입력 시 출발 온도를 귀가 endpoint에도 사용

경고가 있으면 평균 온도가 적합 범위 안이어도 level은 `caution`이다. 비와 오래 걷기 부적합 Item 경고도 같은 `warnings` 배열에 들어가며 동일하게 `caution`을 만든다.

## 8. Rating, 착용 횟수, 최근성

현재 최종 정렬 comparator는 다음 순서를 사용한다.

1. level: `high → possible → caution`
2. 목표 온도와 직접 `okRange`의 거리: 가까운 순
3. 두 후보가 모두 미착용이면 핵심 Item 근거 비율이 높은 순
4. 두 후보가 모두 미착용이면 최상 유사 Outfit의 weighted similarity가 높은 순
5. Rating: `favorite → ok → unrated(null) → error`
6. Outfit의 distinct Wear Log 수가 많은 순
7. `wornOn`이 최근인 순
8. Outfit ID 문자열 오름차순

`error` Outfit은 comparator에 오기 전에 제외되므로 `ratingRank.error`는 현재 정상 후보 정렬에서는 사용되지 않는다. 같은 날짜·같은 Outfit이라도 Wear Log ID가 다르면 각각 한 번으로 센다.

마지막 Outfit ID 비교가 완전 동률의 결정적 tie-breaker다. 입력 배열 순서에 의존하지 않는다.

## 9. Place와 Transport 근거

현재 Place와 Transport는 순위에 영향을 주지 않는다. 직접 Wear Log가 있는 Outfit의 이유를 만들 때 각각 독립적으로 센다.

```text
placeMatches = 현재 placeId와 같은 Wear Log 수
transportMatches = 현재 transportModeId와 같은 Wear Log 수
```

- 현재 Place가 없으면 Place 이유를 만들지 않는다.
- 현재 Transport가 없으면 Transport 이유를 만들지 않는다.
- 과거 값이 null이면 해당 독립 일치 수에 포함되지 않는다.
- 같은 Wear Log에서 Place와 Transport가 동시에 일치했는지는 계산하지 않는다.
- Place 일치 횟수와 Transport 일치 횟수는 서로 겹칠 수 있으며, 공동 맥락 횟수가 아니다.

현재 이유 예시는 `같은 장소에서 N회 착용`, `같은 교통수단으로 N회 착용`이다. P5A의 exact-context와 Place-only fallback은 이 독립 집계와 별도 계약으로 추가되어야 한다.

## 10. 유사 착장과 미착용 Outfit

직접 Wear Log가 없는 Outfit만 유사 착장 근거를 계산한다.

- Item별 thermal weight를 사용한 weighted similarity
- 공통 Item 최소 2개
- weighted similarity 최소 0.4
- 액세서리처럼 열 영향이 낮은 Item만 공유한 경우 제외
- thermal anchor가 없으면 최소 similarity 0.65
- 핵심 Item별 OK 범위 교집합과 최대 3개 유사 Outfit 근거

유사 근거는 시험 착장 설명과 시험 착장끼리의 순위에 쓰인다. 직접 Wear Log가 하나라도 생기면 해당 Outfit은 유사 근거 대신 직접 근거만 사용한다.

현재 `evaluateOutfit`의 level은 직접 `okRange`만 사용하므로 미착용 Outfit은 계산 시 `caution`이다. 이후 `partitionRecommendations`가 유사 근거 범위에 현재 목표 온도가 포함되는 미착용 Outfit만 `trialRecommendations`로 분리한다.

## 11. HOME 그룹 분리

`partitionRecommendations`는 정렬된 전체 결과의 상대 순서를 보존하면서 다음 그룹을 만든다.

- 최근 구매 착장: 직접 착용 근거가 있고, 최근 구매 대상 Item이 있으며, 직접 온도 범위가 현재 목표를 포함하는 상위 3개
- 추천: 직접 착용 근거가 있으면서 최근 구매 영역으로 빠지지 않은 Outfit
- 시험 착장: 미착용이고 유사/Item 부분 근거 온도 범위가 현재 목표를 포함하는 Outfit

최근 구매 판단에서는 Innerwear, Socks와 일부 보조 액세서리 Category를 제외한다. 최근 구매 그룹 판정은 온도 범위 포함 여부를 보지만 endpoint·비·걷기 경고에 따른 `caution` 여부를 별도로 제외 조건으로 쓰지는 않는다.

## 12. P5A에서 보존해야 할 기준선

- Context는 현재 level과 온도 거리보다 앞설 수 없다.
- feature flag 기본값은 비활성이어야 한다.
- 비활성 상태의 결과 배열과 각 결과의 기존 이유·경고는 현재와 같아야 한다.
- exact-context와 Place-only fallback은 동일 Wear Log를 동시에 세지 않는다.
- 현재 Transport가 없으면 exact-context 순위를 만들지 않는다.
- 과거 null Transport는 exact Transport 일치로 간주하지 않는다.
- Context 값이 동률이거나 유효하지 않으면 Rating → Wear Log 수 → 최근성 → Outfit ID의 현재 순서로 돌아간다.
- 순위와 설명은 한 번 계산한 동일 structured context evidence를 사용해야 한다.

