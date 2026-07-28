# Closet Index Phase 2 Weather Automation Plan

- 작성일: 2026-07-28
- 상태: W0~W6 구현, W7 자동·공개·PC/모바일 추천 적용과 첫 실제 weather Wear Log 검증 완료, 5회 실사용 1/5 진행
- 목표 릴리스: Phase 2 Weather Automation
- Supabase project ref: `ddlwainwollvpaeccpty`
- Closet workspace: `00000000-0000-0000-0000-000000000003`
- 공식 API: [기상청 단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do)
- 관련 문서: [Roadmap](./roadmap.md), [Product Plan](./product-plan.md), [Phase 1 MVP Spec](./phase-1-mvp-spec.md), [Data & Security](./phase-1-data-security-spec.md)

## 1. 목표

Phase 2의 목적은 J가 외출 전에 날씨를 확인하고 출발·귀가 온도를 직접 계산하던 과정을 자동화하는 것이다.

완성된 흐름은 다음과 같다.

```text
외출 날짜·출발 시각·귀가 시각 선택
→ 기본 예보 위치의 시간별 기상청 예보 조회
→ 출발·귀가 온도와 평균 추천 온도 표시
→ 외출 구간의 비·눈 가능성과 양 끝 온도 경고 표시
→ 기존 Phase 1 추천 엔진에 같은 입력 계약으로 전달
→ 필요하면 J가 온도와 비 조건을 직접 수정
→ 선택한 착장의 Wear Log에 입력값과 출처 기록
```

날씨 API가 실패해도 현재 수동 입력과 추천·기록 흐름은 그대로 사용할 수 있어야 한다.

## 2. Phase 2를 시작할 수 있는 현재 기반

다음 기반은 이미 구현되어 있다.

- HOME 추천 입력이 `tempOut`, `tempBack`, `rainCondition`, `longWalkCondition`, 장소, 교통수단을 받는다.
- 추천 엔진은 평균 온도로 후보를 정렬하면서 출발·귀가 양 끝 온도를 별도로 경고한다.
- Wear Log는 출발·귀가 온도와 `temperature_source`를 저장한다.
- DB의 `temperature_source` 제약은 이미 `notion | manual | weather`를 허용한다.
- API가 없어도 작동하는 수동 추천과 Wear Log CRUD가 있다.
- Supabase Auth와 workspace membership/RLS 경계가 있다.

따라서 Phase 2는 추천 엔진을 새로 만드는 작업이 아니라, 검증된 수동 입력 앞에 신뢰할 수 있는 날씨 입력 계층을 추가하는 작업이다.

Phase 1B의 전체 이미지 확대 작업은 Phase 2의 선행 조건이 아니다. 다만 Phase 2 구현을 시작하기 전 현재 가방·신발 기본 크기와 독립 조정 변경을 안정된 체크포인트로 커밋·배포해 둔다.

## 3. 범위

### 3.1 포함

- 기상청 단기예보 개발계정 인증키의 안전한 서버 측 사용
- 하나의 기본 예보 위치 설정
- 외출 날짜, 출발 시각, 귀가 시각 입력
- 시간별 단기예보 조회
- 출발·귀가 온도와 평균 온도 계산
- 외출 구간의 강수형태·강수량·강수확률·습도 요약
- 기존 추천 입력으로의 명시적 적용
- 날씨값 수동 수정과 전체 수동 모드
- HOME → Outfit 상세 → 뒤로 가기 및 앱 전환 뒤 입력 상태 복원
- Wear Log에 날씨 출처와 수동 수정 여부 기록
- API 실패·예보 없음·범위 밖 날짜 fallback

### 3.2 제외

- GPS 상시 추적
- 브라우저 위치 권한을 이용한 자동 현위치 조회
- 주소 검색·지오코딩 API
- 이동 경로별 여러 지역의 예보 결합
- 체감온도 자체 공식의 임의 구현
- 습도에 따른 추천 점수 변경
- 강수확률만으로 `비 있음`을 자동 확정
- 기상특보·미세먼지·자외선·꽃가루
- 푸시 알림과 백그라운드 정기 조회
- 중기예보와 5일 이후 계획

이 항목들은 Phase 2 실사용 결과가 쌓인 뒤 별도 범위로 결정한다.

## 4. 제품 결정

### 4.1 예보 API

첫 구현은 단기예보 endpoint 하나만 사용한다.

```text
VilageFcstInfoService_2.0/getVilageFcst
```

초단기예보는 현재부터 6시간 안의 보정에 유용하지만, 출발과 귀가가 하루를 넘거나 다음 날 착장을 고르는 흐름까지 하나의 계약으로 처리하기 위해 MVP에서는 단기예보를 우선한다.

API 요청은 `dataType=JSON`을 사용하고, 다음 값을 정규화한다.

| 기상청 category | 앱 사용 |
|---|---|
| `TMP` | 시간별 기온 |
| `REH` | 습도 표시 |
| `POP` | 강수확률 표시 |
| `PTY` | 비·비/눈·눈·소나기 판정 |
| `PCP` | 예상 강수량 표시와 강수 보조 판정 |
| `SNO` | 예상 적설 표시 |
| `SKY` | 날씨 요약 표시 |
| `WSD` | 향후 체감온도 검토용 표시 데이터 |

category와 발표시각 규칙은 2026-07 공식 활용가이드 기준으로 adapter와 테스트에 반영했다. 2026-07-28 11:00 KST 발표분의 실제 JSON 835건을 local-only fixture로 대조했고, 앱이 사용하는 8개 category와 값 형식이 adapter 계약에 맞는 것을 확인했다.

### 4.2 예보 위치

MVP는 Settings에서 선택한 예보 위치 하나를 기본값으로 사용한다.

- 저장값: 위치 이름, 기상청 격자 `nx`, `ny`, 기본 위치 여부
- 정밀 GPS 좌표는 저장하지 않는다.
- 초기 위치는 `창4동`으로 표시하고, 공식 행정동 `서울특별시 도봉구 창제4동`의 기상청 격자 `nx = 61`, `ny = 129`를 사용한다.
- 위치를 코드에 하드코딩하지 않는다.
- 여러 목적지와 자동 현위치는 후속 범위다.

### 4.3 날짜와 시각

- 외출 날짜는 오늘을 기본값으로 한다.
- 선택 가능한 마지막 날짜는 숫자로 고정하지 않고 실제 API 응답의 예보 범위로 제한한다.
- 1시간 간격 예보 구간에서는 출발·귀가 시각을 1시간 단위로 선택한다.
- 기상청이 3시간 간격만 제공하는 연장 구간에서는 실제 응답에 포함된 시각만 선택지로 보여 준다. 임의 보간이나 가까운 시각으로의 자동 반올림은 하지 않는다.
- HOME의 새 세션은 출발 20:00, 귀가 00:00을 기본값으로 사용하며 00:00은 다음 날 귀가로 표시한다.
- 귀가 시각이 출발 시각보다 이르면 다음 날 귀가로 해석하고 화면에서 명확히 표시한다.
- 출발과 귀가가 같은 시각이면 한 시간대의 온도를 두 값에 함께 사용하되 평균 계산에서 중복 가중하지 않는다.

### 4.4 온도

- 출발·귀가 온도는 각각 해당 시각의 `TMP`를 사용한다.
- 추천 정렬은 기존 규칙대로 두 온도의 평균을 사용한다.
- 평균은 화면에서 소수점 첫째 자리까지 표시할 수 있지만 원본 출발·귀가 값은 그대로 보존한다.
- 평균만으로 위험을 숨기지 않고 출발·귀가 온도 경고를 각각 유지한다.
- J가 온도를 수정하면 수정값이 추천 입력에 우선한다.

### 4.5 비·눈

강수는 출발과 귀가 두 지점만 보지 않고 외출 구간 전체의 시간별 예보를 확인한다.

- 구간 중 하나라도 `PTY`가 강수를 나타내면 `rainCondition = yes` 후보로 제안한다.
- `PCP`가 실제 강수량을 나타내면 `PTY`와 함께 비 조건 근거로 사용한다.
- `POP`만 높고 `PTY/PCP`가 없는 경우에는 강수확률 경고만 표시하고 `비 있음`을 자동 확정하지 않는다.
- 눈과 비/눈도 현재 Item의 `rainOk` 경고를 재사용하되, 화면에는 눈임을 별도로 표시한다.
- J가 비 조건을 직접 바꾸면 수동값이 우선한다.

### 4.6 습도와 바람

습도와 풍속은 첫 릴리스에서 정보로만 표시한다. 추천 점수나 적정 온도를 자동 변경하지 않는다.

과거 Wear Log와 실제 체감 비교가 쌓이기 전에 습도나 풍속을 임의의 체감온도 공식으로 바꾸면 현재 설명 가능한 추천 원칙이 흐려질 수 있기 때문이다.

## 5. 사용자 흐름

### 5.1 Settings

`날씨 위치` 영역을 추가한다.

```text
기본 위치
창4동
기상청 격자 61, 129

[위치 변경]
```

일반 사용 화면에는 격자 숫자를 강조하지 않는다. 위치 변경 화면이나 진단 정보에서만 확인할 수 있게 한다.

### 5.2 HOME 초기 상태

HOME의 기존 수동 온도 폼 위에 날씨 조회 영역을 둔다.

```text
오늘 · 창4동
출발 09:00
귀가 18:00

[날씨 불러오기]
```

자동으로 API를 반복 호출하지 않는다. 날짜·시각·위치를 정한 뒤 명시적으로 불러오며, 같은 발표 예보는 세션 캐시를 재사용한다.

### 5.3 조회 성공

```text
출발 24°C
귀가 20°C
평균 22°C

외출 중 비 예보 없음
최대 강수확률 30%
습도 62~78%

기상청 07/28 05:00 발표
[이 날씨로 추천 보기]
```

`이 날씨로 추천 보기`를 눌렀을 때만 기존 추천 입력에 반영한다. 날씨 응답을 받는 즉시 결과를 조용히 바꾸지 않는다.

### 5.4 수동 수정

날씨 적용 뒤 기존 온도·비 입력은 계속 편집할 수 있다.

- 수정 전: `기상청 예보`
- 한 값이라도 수정: `기상청 예보에서 직접 수정`
- 전체 수동 모드: `직접 입력`
- `예보값으로 되돌리기` 제공

### 5.5 조회 실패

```text
날씨를 불러오지 못했어요.
직접 온도를 입력하면 추천은 계속 사용할 수 있습니다.

[다시 시도] [직접 입력]
```

API 오류 때문에 기존 데이터 로딩, 추천 계산, Outfit 탐색, Wear Log 저장을 막지 않는다.

## 6. 클라이언트와 서버 계약

### 6.1 전체 구조

```text
React PWA
  → 로그인 세션 JWT
  → Supabase Edge Function: closet-weather-forecast
  → Supabase Secret: KMA_SERVICE_KEY
  → 기상청 단기예보 API
  → 정규화된 앱 전용 응답
  → 기존 RecommendationInput
```

브라우저에서 기상청 API를 직접 호출하지 않는다.

### 6.2 요청

```json
{
  "workspaceId": "00000000-0000-0000-0000-000000000003",
  "locationId": "uuid",
  "forecastDate": "2026-07-28",
  "departureTime": "09:00",
  "returnTime": "18:00"
}
```

Edge Function은 다음을 검증한다.

- 유효한 Supabase 사용자 JWT
- 요청 사용자의 workspace membership
- 요청한 위치가 같은 workspace 소유인지
- 날짜·시각 형식
- 허용된 예보 범위
- 출발부터 귀가까지의 최대 구간

### 6.3 응답

```json
{
  "source": "kma-vilage-fcst",
  "issuedAt": "2026-07-28T05:00:00+09:00",
  "fetchedAt": "2026-07-28T07:12:30+09:00",
  "location": {
    "id": "uuid",
    "label": "창4동"
  },
  "departure": {
    "at": "2026-07-28T09:00:00+09:00",
    "temperature": 24,
    "humidity": 68,
    "precipitationType": "none",
    "precipitationAmount": null,
    "precipitationProbability": 20
  },
  "return": {
    "at": "2026-07-28T18:00:00+09:00",
    "temperature": 20,
    "humidity": 76,
    "precipitationType": "none",
    "precipitationAmount": null,
    "precipitationProbability": 30
  },
  "period": {
    "hasPrecipitation": false,
    "maxPrecipitationProbability": 30,
    "minHumidity": 62,
    "maxHumidity": 78
  },
  "stale": false,
  "warnings": []
}
```

클라이언트는 기상청 원본 category 배열을 직접 해석하지 않는다. 원본 형식 변화와 오류 처리는 Edge Function adapter가 담당한다.

## 7. 데이터 구조

### 7.1 예보 위치

새 테이블 후보:

```text
closet_weather_locations
```

필수 컬럼:

| 컬럼 | 의미 |
|---|---|
| `id` | 위치 UUID |
| `workspace_id` | 기존 workspace 소유권 |
| `label` | 앱 표시 이름 |
| `nx`, `ny` | 기상청 격자 |
| `is_default` | 기본 위치 |
| `created_at`, `updated_at` | 변경 추적 |

제약:

- `nx`, `ny`는 양의 정수
- workspace마다 기본 위치는 최대 하나
- RLS는 기존 workspace membership 체계를 재사용
- Data API 노출 여부와 `authenticated` 권한을 RLS와 별도로 확인

### 7.2 Wear Log 날씨 출처

기존 `temperature_source = weather`를 사용한다. 다음 provenance 컬럼을 migration 후보로 둔다.

| 컬럼 | 의미 |
|---|---|
| `weather_location_id` | 사용한 예보 위치 |
| `weather_issued_at` | 예보 발표시각 |
| `weather_overridden` | 예보 적용 후 직접 수정 여부 |

기상청 원본 전체 JSON은 Wear Log마다 저장하지 않는다. 추천과 기록을 설명하는 데 필요한 최소 출처만 보존한다.

### 7.3 캐시

첫 단계에서는 별도 forecast cache 테이블을 만들지 않는다.

- 클라이언트가 `location + issuedAt + target period` 기준으로 세션 캐시
- 같은 HOME 입력으로 상세 화면을 오갈 때 재호출하지 않음
- 앱을 다시 열거나 새 발표가 확인되면 다시 조회

실사용 호출량이나 API 지연이 문제가 될 때만 서버 캐시 테이블을 추가한다.

## 8. 보안과 Secret

- 기상청 인증키 이름은 `KMA_SERVICE_KEY`로 고정한다.
- 실제 값은 Supabase Edge Function Secret에만 저장한다.
- `.env.local`, `supabase/functions/.env` 같은 로컬 Secret 파일은 Git에서 제외한다.
- 인증키를 `VITE_*`, React 코드, 문서, 로그, 테스트 fixture에 넣지 않는다.
- Edge Function은 인증된 사용자 호출만 허용하고 public endpoint로 열지 않는다.
- 사용자 membership 검증에 `user_metadata`를 사용하지 않는다.
- 외부 API 오류 응답에 인증키가 포함되지 않도록 URL과 로그를 정리한다.
- 로그에는 request id, 격자, 발표시각, 결과코드, 응답시간만 남기고 Secret과 전체 원본 응답은 남기지 않는다.
- 외부 요청 timeout, 응답 크기 상한, JSON schema 검증을 둔다.
- 원격 DB 변경 전 현재 schema와 migration 상태를 읽기 전용으로 다시 확인한다.
- 함수·migration 구현 뒤 Supabase advisor와 인증·비인증 호출을 검증한다.

참고:

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets)
- [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth)

## 9. 구현 단계

### W0. 인증키와 공식 계약 확인

작업:

- 공공데이터포털 개발계정 승인·인증키 활성 상태 확인
- 일반 인증키와 URL-encoded 인증키 중 실제 요청 방식 확인
- 2026-07 활용가이드 보관 위치 확인
- 실제 `getVilageFcst` JSON 한 건을 local-only fixture로 저장
- 발표시각 선택 규칙, 응답 지연 여유, category 값을 가이드와 대조
- Secret 파일과 fixture의 Git 제외 여부 확인

현재 상태:

- 개발계정 인증키 활성화는 J가 확인했다.
- 공식 활용가이드와 격자 엑셀의 보관 위치를 확인했다.
- `supabase/functions/.env`의 로컬 인증키가 비어 있지 않고 Git에서 제외되는 것을 값 출력 없이 확인했다.
- 인증키 형식 자동 판별이 일반 인증키(`decoded`) 요청을 선택했고, `npm run weather:capture`가 `resultCode = 00`, `NORMAL_SERVICE` 실응답 835건을 Git 제외 fixture에 저장했다.
- 실응답은 `20260728/1100`, 격자 `61, 129`이며 adapter가 69개 예보시점으로 정규화했다. 예보 범위는 2026-07-28 12:00부터 2026-08-01 00:00 KST까지다.
- 모든 예보시점에 `TMP/REH/POP/PTY/PCP/SNO/SKY/WSD`가 있었고, 실제 `PCP`의 `0`·`강수없음`과 `SNO`의 `0`·`적설없음` 형식도 정상 처리했다.
- 2026-07-31 연장 구간은 응답에 `00/03/06/09/12/15/18/21시`만 있으며 adapter도 이 8개 실제 시각만 반환했다.
- 실응답의 `POP = 30`, `PTY = 0`, 강수량 없음 사례에서 강수를 확정하지 않는 규칙을 확인했다.
- 발표 후 10분, 자정 전후의 `base_date/base_time` 선택 규칙은 테스트로 고정했다.

완료 조건:

- Secret을 출력하거나 Git에 넣지 않고 실제 API `resultCode = 00` 응답을 재현한다.
- 자정 전후와 발표 직후에 사용할 `base_date/base_time` 선택 규칙이 테스트로 고정된다.

### W1. 순수 날씨 adapter와 테스트

작업:

- 기상청 응답 타입과 앱 정규화 타입 작성
- 날짜·시각과 최신 발표본 계산 함수
- category 배열을 시간대별 point로 묶는 parser
- 출발·귀가 point 선택
- 외출 구간 강수·습도 요약
- API error, 빈 items, 누락 category, 문자열 강수량 처리

완료 조건:

- 네트워크 없이 fixture로 parser 테스트가 통과한다.
- 정상, 자정 넘김, 비, 눈, 누락 시간대, malformed response가 구분된다.

현재 상태:

- 순수 adapter와 15개 fixture 테스트를 구현했다.
- 발표 직전·직후, 자정 전후, 정상, 자정 넘김, 구간 중간 강수, `POP` 단독, 눈, 문자열 강수량, Missing sentinel, 누락 category, 누락 시각, API 오류, 빈 items, malformed 응답을 검증했다.
- 3시간 간격 구간은 응답에 실제 존재하는 시각만 반환한다.

### W2. 예보 위치 migration과 Settings

작업:

- Supabase CLI `--help`로 현재 migration 명령 확인
- 현재 원격 schema와 migration 상태 읽기 전용 대조
- `closet_weather_locations` migration 생성
- workspace membership 기반 RLS·권한·constraint 작성
- 기본 위치 Settings UI와 repository 계약 추가
- demo mode용 위치 fixture 추가

완료 조건:

- 회원은 자신의 workspace 위치만 읽고 수정할 수 있다.
- 비로그인·비회원 접근이 거부된다.
- 기본 위치가 없으면 HOME이 수동 모드로 정상 작동한다.

현재 상태:

- `20260728113309_phase2_weather_locations` migration을 원격 mworkroom 프로젝트에 적용했다.
- 위치 이름·공식 행정동·행정동 코드·기상청 격자·기본 여부를 workspace 소유 데이터로 저장한다.
- workspace별 기본 위치는 최대 하나이며, `nx`, `ny`는 양의 정수로 제한한다.
- `anon`에는 권한을 주지 않고 `authenticated`의 명시적 권한과 workspace membership RLS 정책 4개를 분리해 설정했다.
- 초기 기본 위치 `창4동 / 서울특별시 도봉구 창제4동 / 1132051400 / 61,129`를 DB와 demo fixture에 저장했다.
- Settings에서 기본 위치를 확인하고 수정할 수 있으며, repository와 DataContext 저장 계약을 연결했다.
- 원격 RLS 검증에서 workspace 회원은 1개, 비회원은 0개의 위치를 읽었다.

### W3. 인증된 Edge Function

작업:

- `closet-weather-forecast` 함수 생성
- 사용자 JWT와 workspace membership 검증
- `KMA_SERVICE_KEY` Secret 사용
- 기상청 요청·정규화·timeout·오류 mapping
- CORS와 요청 schema 제한
- 로컬 mock/fixture 테스트와 원격 실제 호출 분리

완료 조건:

- 프런트엔드 bundle과 Git 이력에 인증키가 없다.
- 인증 회원의 정상 요청은 앱 전용 응답을 반환한다.
- 비로그인·다른 workspace·잘못된 입력은 명확히 거부된다.
- 외부 API 실패는 5xx 원문이 아니라 안정된 앱 오류코드로 변환된다.

현재 상태:

- `closet-weather-forecast` v2를 원격 mworkroom 프로젝트에 `ACTIVE`, `verify_jwt = true`로 배포했다.
- `KMA_SERVICE_KEY`, `KMA_SERVICE_KEY_FORMAT`은 원격 Edge Function Secret으로만 저장했으며 함수 코드·Git 후보 132개 파일에는 실제 인증키 문자열이 없다.
- `@supabase/server`의 `auth: user` 컨텍스트와 호출자 범위 Supabase client를 사용해 `workspace_members`와 `closet_weather_locations`를 확인한다. 다른 workspace의 위치는 service role 우회 없이 기존 RLS 안에서 차단한다.
- 요청은 정확한 5개 필드, UUID·날짜·정시 형식, 오늘부터 4일 이내 범위, 4KiB 상한으로 제한했다. 응답은 페이지당 1MiB, 전체 5,000건, 요청당 8초 timeout 상한을 둔다.
- CORS는 공개 Pages와 로컬 개발 origin만 허용한다. 원격 preflight는 Pages origin에 200과 동일 origin을 반환했고, 인증 없는 POST는 401로 거부됐다.
- 기상청 API·빈 데이터·누락 시각·malformed 응답·timeout을 안정된 앱 오류코드로 변환하고 KMA 원본 category 배열과 인증키는 응답에 넣지 않는다.
- 로컬 handler·adapter 24개 테스트와 전체 회귀 테스트가 통과했다.
- 인증 회원의 실제 KMA 정상 응답은 프런트 호출 표면이 생기는 W4 첫 연동에서 확인한다. 현재 W3의 인증·비회원 경계는 단위 테스트와 기존 원격 RLS, 무인증 401로 검증된 상태다.

### W4. HOME 날씨 입력 UI

작업:

- 날짜·출발·귀가 시각 컨트롤
- 기본 예보 위치 표시
- 불러오기·로딩·성공·실패 상태
- 출발·귀가·평균 온도와 날씨 요약
- `이 날씨로 추천 보기`
- 예보값 수정·되돌리기·직접 입력
- 선택값과 제출된 추천 입력을 session storage에 보존

완료 조건:

- Outfit 상세를 열었다 돌아와도 날짜·시각·추천 결과가 유지된다.
- 다른 앱으로 이동했다 돌아와도 같은 탭에서는 입력이 유지된다.
- API 실패 시 현재 수동 입력 폼으로 즉시 계속할 수 있다.

현재 상태:

- HOME에 기본 예보 위치, 날짜, 출발·귀가 정시 선택, 명시적 `날씨 불러오기`를 추가했다.
- repository와 DataContext를 통해 인증된 `closet-weather-forecast` 함수를 호출하며, 함수 오류코드는 수동 입력으로 이어질 수 있는 안정된 한국어 메시지로 변환한다.
- 출발·귀가·평균 온도, 외출 구간 강수 여부, 최대 강수확률, 습도 범위, 발표시각을 표시한다.
- 예보 응답만으로 추천을 바꾸지 않고 `이 날씨로 추천 보기`를 눌렀을 때만 기존 `RecommendationInput`에 반영한다.
- 적용 뒤 기존 수동 폼에서 값을 바꿀 수 있고 `기상청 예보`, `기상청 예보에서 직접 수정`, `직접 입력` 상태와 `예보값으로 되돌리기`를 제공한다.
- 날짜·시각·예보·적용된 추천 입력은 버전이 있는 session storage에 저장한다. HOME에서 상세로 이동했다 돌아오거나 같은 탭에서 앱 전환 후 복귀해도 복원된다.
- 같은 위치·날짜·출발·귀가 시각의 예보는 세션에 저장된 응답을 재사용한다.
- demo repository의 결정적 예보 fixture와 HOME 적용·복원 테스트, Supabase 함수 요청 계약 테스트를 추가했다.
- 인증 회원의 원격 실제 KMA 정상 응답과 iPhone 화면 확인은 공개 앱 반영 뒤 W7 통합 검증에서 수행한다.

### W5. 기존 추천과 연결

작업:

- 날씨 응답을 기존 `RecommendationInput`으로 변환
- 출발·귀가 평균 정렬 유지
- 양 끝 온도 경고 유지
- 외출 구간 강수에 따른 `rainCondition` 제안
- 습도·풍속은 정보 표시만 유지
- 기존 수동 추천 결과와 회귀 비교

완료 조건:

- 같은 온도·비 입력이면 날씨 모드와 수동 모드의 추천 순서가 같다.
- 평균값이 같아도 출발·귀가 위험 경고가 사라지지 않는다.
- 강수확률만 높다는 이유로 비 부적합 Outfit이 자동 탈락하지 않는다.

현재 상태:

- 정규화된 날씨 응답을 기존 `RecommendationInput`으로 바꾸는 순수 변환 함수를 추가하고 HOME 적용 흐름에서 사용한다.
- 날씨 모드와 수동 모드에 같은 온도·비·걷기·장소·교통 입력을 주면 추천 순서, 추천 단계, 경고, 평균 온도가 동일함을 회귀 테스트로 확인했다.
- 평균 16°C인 `출발 18°C / 귀가 14°C`는 귀가 끝점 경고를 유지하고, 같은 평균의 `16°C / 16°C`와 구분되는 것을 확인했다.
- 외출 구간의 실제 강수가 있으면 `rainCondition = yes`로 변환해 기존 아이템 비 부적합 경고를 재사용한다.
- `POP = 90%`여도 구간 강수가 없으면 `rainCondition = no`를 유지한다.
- 습도와 풍속 값이 달라도 추천 입력과 결과에는 영향을 주지 않는다.
- 출발 온도가 누락된 응답은 추천 적용을 차단하고 수동 입력 안내를 유지한다.

### W6. Wear Log와 provenance

작업:

- 추천에서 Wear Log로 날씨 입력과 출처 전달
- `temperature_source = weather` 저장
- 직접 수정 시 `weather_overridden = true`
- 발표시각과 위치 참조 저장
- 기존 Notion·manual 기록 조회 호환성 유지

완료 조건:

- 자동 예보값, 수정된 예보값, 순수 수동값을 구분할 수 있다.
- Wear Log 수정·삭제·통계가 기존처럼 동작한다.

현재 상태:

- HOME에서 적용한 예보의 위치, 발표시각, 원래 온도·비 조건과 수정 여부를 추천 카드 navigation state에 함께 보존한다.
- HOME → Outfit 상세 → Wear Log 경로에서 출처가 유지되며, Wear Log 화면에서 값을 추가로 바꾸면 `weather_overridden = true`가 된다.
- Wear Log와 repository 계약에 `temperature_source`, `weather_location_id`, `weather_issued_at`, `weather_overridden`을 연결했다.
- 착용 기록 입력 화면과 Outfit 기록 목록에서 `기상청 예보`, `기상청 예보에서 직접 수정`, `직접 입력`, `기존 Notion 기록`을 구분해 표시한다.
- 원격 DB에 workspace 소유권 FK, weather/non-weather 일관성 check, FK index, 인증 사용자 컬럼 권한을 migration으로 적용했다.
- 기존 783개 기록은 변경 없이 유지됐고, 기존 Notion 782개·manual 1개 모두 null weather metadata와 `weather_overridden = false`로 제약을 통과한다.
- 전체 Vitest 26개 파일 128개 테스트와 production build가 통과했다.
- 로컬 pgTAP은 로컬 Postgres 미실행으로 접속하지 못했지만, 원격 스키마·제약·권한·행 수를 읽기 전용으로 재검증했다.

### W7. 통합 검증과 공개 배포

자동 검증:

- parser fixture와 경계시간 테스트
- 추천 회귀 테스트
- repository·RLS·Edge Function 계약 테스트
- typecheck, 전체 Vitest, production build
- Secret 문자열과 local fixture Git 제외 확인

실사용 검증:

- 오늘 출발·귀가
- 다음 날 외출
- 자정을 넘는 귀가
- 외출 중간에만 비가 오는 경우
- API 실패 후 수동 입력
- HOME → 상세 → 뒤로 가기 상태 복원
- iPhone Safari와 홈 화면 PWA

배포 검증:

- 원격 Edge Function 로그에 Secret 없음
- Pages bundle에 Secret 없음
- 공개 PWA에서 로그인 회원만 함수 호출 성공
- 실제 추천과 Wear Log 저장 확인

현재 상태:

- HOME에서 예보 조회·명시적 적용 후 추천 착장을 열고, 뒤로 돌아왔을 때 출발·귀가 온도와 추천 결과가 유지되는 통합 테스트를 추가했다.
- 같은 흐름에서 다시 착장 상세로 이동해 `오늘 입기`를 누르고, Wear Log 저장 입력에 `weather` 출처·위치·발표시각·수정 여부가 전달되는 것을 검증했다.
- 날씨 API가 실패해도 오류 안내 뒤 기존 수동 입력으로 추천을 계속할 수 있는 UI 회귀 테스트를 추가했다.
- 전체 Vitest 27개 파일 130개 테스트, typecheck, production build, Pages artifact 검증이 통과했다.
- 원격 migration은 `20260728160018_phase2_wear_log_weather_provenance`까지 일치하고, `closet-weather-forecast` v3는 `ACTIVE`, `verify_jwt = true` 상태다.
- GitHub Pages 공개 배포와 로그인 회원의 실제 KMA 호출을 확인했다. 창4동 07/28 23:00 발표 예보가 출발 28°C, 귀가 30°C, 평균 29°C로 표시됐고 기존 추천 엔진에 적용되어 추천 목록을 만들었다.
- 최초 공개 호출에서는 기존 Closet workspace UUID의 version/variant가 0인 특성을 함수가 잘못 거부했다. PostgreSQL UUID 문법으로 검증 범위를 바로잡고 실제 workspace ID를 정상 경로 테스트에 넣은 뒤 원격 함수 v3에서 성공을 재확인했다.
- 2026-07-29 J가 공개 앱의 PC와 모바일 환경에서 날씨 추천 적용이 모두 정상 작동한다고 확인했다.
- J가 실제 착용 흐름으로 첫 Wear Log를 저장한 뒤 원격 784개 기록을 읽기 전용으로 집계했다. `temperature_source = weather` 1개와 위치·발표시각이 모두 있는 완전한 provenance 1개가 일치했다.
- 첫 실제 기록은 2026-07-29 착용, 출발 28°C, 귀가 26°C, 2026-07-28 23:00 KST 발표 예보, `weather_overridden = false`로 저장됐다. 착장명과 메모는 조회하지 않았다.
- PC·모바일 추천 적용과 실제 Wear Log 저장 1회는 확인됐으며, 남은 4회의 실사용 비교는 J의 실제 사용 흐름에서 진행한다.

## 10. 테스트 기준

| 조건 | 기대 결과 |
|---|---|
| 출발·귀가 모두 예보 있음 | 두 온도와 평균 표시 |
| 귀가 시각이 더 이른 시각 | 다음 날 귀가로 명시 |
| 한 시간대 category 일부 누락 | 해당 값만 `정보 없음`, 전체 앱 유지 |
| 출발 또는 귀가 point 없음 | 날씨 적용 차단, 수동 입력 안내 |
| 구간 중간에 `PTY` 강수 있음 | 비 조건 제안 |
| `POP`만 높음 | 확률 경고만 표시 |
| API timeout·오류코드 | 재시도와 수동 입력 제공 |
| 인증 없음 | 함수 호출 거부 |
| 다른 workspace 위치 | 함수 호출 거부 |
| 날씨 적용 후 온도 수정 | 수정값 우선, overridden 기록 |
| 상세 화면 왕복 | 입력과 추천 결과 유지 |
| 기존 수동 사용 | Phase 1 결과와 동일 |

## 11. 완료 정의

Phase 2는 다음 조건을 모두 만족하면 완료로 본다.

- [x] 기상청 인증키가 브라우저와 Git에 노출되지 않는다.
- [x] 기본 위치와 출발·귀가 시각으로 예보를 불러올 수 있다.
- [x] 출발·귀가·평균 온도와 외출 구간 강수를 이해할 수 있게 표시한다.
- [x] 기존 수동 추천과 같은 입력에서 같은 결과를 만든다.
- [x] 양 끝 온도 경고가 유지된다.
- [x] 날씨값을 직접 수정하거나 전체 수동 모드로 전환할 수 있다.
- [x] API 실패나 예보 없음에도 추천·탐색·기록이 중단되지 않는다.
- [x] HOME 상태가 상세 왕복과 앱 전환 뒤에도 유지된다.
- [x] Wear Log에서 weather·weather overridden·manual 출처를 구분할 수 있다.
- [x] 비로그인·비회원 Edge Function 호출이 거부된다.
- [ ] iPhone 실사용 5회 이상에서 수동 계산과 납득 가능한 수준으로 일치한다. 현재 실제 weather Wear Log 1/5 저장 완료.
- [x] 전체 자동 테스트, production build, 원격 함수, 공개 Pages 통합 검증이 통과한다.

## 12. 구현 시작 전에 J와 확인한 값

2026-07-28에 다음 값을 확인했다.

1. 기상청 개발계정 인증키: 활성화됨
2. 기본 예보 위치 표시 이름: `창4동`
3. 공식 행정동과 코드: `서울특별시 도봉구 창제4동`, `1132051400`
4. 기상청 격자: `nx = 61`, `ny = 129`
5. 3시간 간격 연장 예보: 실제 제공 시각만 선택하고 보간·자동 반올림하지 않음

기상청 인증키 실제 값은 대화나 문서에 붙이지 않는다. 로컬 W0 확인에는 Git에서 제외된 `supabase/functions/.env`만 사용하고, 원격 함수에는 Supabase Secret으로만 입력한다.
