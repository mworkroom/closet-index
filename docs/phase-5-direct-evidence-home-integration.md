# Phase 5 Policy E2 + cap 1 disabled HOME integration

## 범위

Policy E2 + movement cap 1을 selected disabled HOME integration candidate로 연결했다. production recommendation, HOME wording·control, Supabase, migration, Wear Log, Transport taxonomy는 변경하지 않았다.

development 전용 flag는 `VITE_P5A_DIRECT_EVIDENCE_E2`다.

- 기본값: `false`
- development: 문자열 `true`일 때만 활성
- production build: 값이 설정되어도 `import.meta.env.DEV=false`이므로 강제 비활성
- rejected Policy B flag와 독립

## 통합 순서와 보존 계약

1. 기존 `recommendOutfits` baseline을 계산한다.
2. 기존 `partitionRecommendations`로 recent purchases, normal recommendations, trial recommendations를 먼저 확정한다.
3. flag가 켜진 경우에만 각 group 안에서 E2 cap 1을 적용한다.

`direct_support`는 한 칸 위, `direct_issue`는 한 칸 아래로만 이동할 수 있다. `mixed`와 `unknown`은 움직이지 않는다. recommendation level, group membership, candidate membership, warnings, reasons와 기존 객체 내용은 바꾸지 않는다. inferred return은 audit provenance일 뿐 순위에 쓰지 않는다.

flag가 꺼진 경우에는 partition 객체와 세 배열을 그대로 반환한다. 따라서 feature-off 결과는 값뿐 아니라 배열 identity도 baseline과 같다.

## Comparator explanation report

E2 cap 1에서 실제 이동한 각 pair에 대해 다음 구조를 같은 direct-evidence 객체에서 생성한다.

- baseline rank와 E2 rank
- recommendation group과 level
- baseline temperature distance
- Rating, total Outfit wear count, last worn date
- 기존 reasons와 warnings
- direct evidence outcome과 observed-once/repeated confidence
- exact-context distinct Wear Log count
- matched endpoint, current/historical temperature, feeling, wornOn

baseline preference는 recent-purchase date 또는 기존 comparator의 temperature distance, untried coverage/similarity, Rating, wear count, last worn, deterministic ID 순서 중 첫 차이를 기록한다.

## Current production SELECT-only replay

production live data의 현재 snapshot을 고정 6 SELECT stream과 익명 10-input matrix로 재확인했다. 이전 simulation 보고서는 당시 snapshot을 보존하며, 이번 수치는 disabled HOME 통합 시점의 새 snapshot이다.

- E2 cap 1 directly moved Outfit: 11
- total changed positions: 22
- maximum individual movement: 1
- group membership changes: 0
- inferred-return ranking adjustment: 0
- moved pair가 존재한 익명 입력: nearby A 30°C, nearby A 28°C, cinema + Car 33°C
- 나머지 nearby B, sustained, evidence 0, winter Car, Place null, Transport null: 무변경

익명 pair 분포는 다음과 같다.

| 입력 | support-up pair | issue-down pair | top-6 pair |
| --- | ---: | ---: | ---: |
| nearby A · 33°C · short | 0 | 0 | 0 |
| nearby A · 30°C · short | 1 | 2 | 0 |
| nearby A · 28°C · short | 4 | 2 | 1 |
| cinema · 33°C · Car | 2 | 0 | 2 |

nearby A 33°C에서는 live baseline 자체가 이미 검토된 Outfit을 normal 1위에 두고 있어 E2 이동이 없었다. nearby A 28°C에서는 검토된 direct-support Outfit이 2위에서 1위로 한 칸 상승했다. cinema + Car 33°C의 두 support-up pair는 데이터 계약에는 맞지만 제품적으로 정답인지 별도 확인이 필요하다.

## Authenticated local HOME QA

feature-off와 feature-on을 같은 `127.0.0.1:5173` origin, 같은 인증 세션에서 순차 실행했다.

- page identity와 Supabase-backed HOME 데이터 로딩 정상
- blank page와 Vite overlay 없음
- feature-off/on 모두 recent/normal/trial candidate membership 유지
- nearby A 28°C normal 2→1 이동 확인
- cinema + Car 33°C normal 2→1 및 6→5 이동 확인
- nearby A 30°C direct-issue는 deep-list에서 한 칸씩만 하락하고 top 6는 유지
- nearby B, sustained, winter, Place null, Transport null top 6 동일
- HOME wording과 card reasons/warnings 표시 변경 없음
- console error/warning 0건

## 결론

E2 + cap 1은 selected disabled candidate다. 한 칸 제한, group/level 경계, feature-off deep equality와 inferred-return exclusion은 검증됐다. development에서 명시적으로 flag를 켜는 local manual QA에는 사용할 수 있지만 기본 local flag와 production flag는 계속 false로 둔다.

production 활성화 전에는 cinema + Car support promotion의 제품 타당성과 Item-level derived evidence가 추가 정보를 제공하는지 별도 audit해야 한다. direct Item observation schema는 P5C 범위이며 아직 구현하지 않는다.
