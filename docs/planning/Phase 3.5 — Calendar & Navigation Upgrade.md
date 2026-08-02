# Phase 3.5 — Calendar & Navigation Upgrade

- 구현 상태: 로컬 구현 및 검증 완료, 공개 배포 전
- 구현일: 2026-08-02

## Summary

- 하단 메뉴를 `Home → Calendar → Closet → Lookbook → More`로 재구성한다.
- Calendar를 월요일 시작의 월간 착장 달력으로 변경한다.
- 선택 날짜의 착장을 아래에 반복 표시하지 않고, 달력 썸네일에서 바로 Outfit 상세로 이동한다.
- 달력 착장 영역은 Lookbook과 같은 3:4 비율을 유지하고, 5주·6주 모두 같은 높이의 날짜 행을 사용한다. 남는 화면 높이는 하단 공백으로 둔다.

## Implementation Changes

### 내비게이션

- Calendar를 주요 탭으로 전환하고 뒤로 가기 버튼을 제거한다.
- Favorite는 기존 `/favorite` 경로와 Lookbook 필터를 유지하되 More의 첫 번째 메뉴로 이동한다.
- More 메뉴 순서는 `Favorite → Statistics → Settings`로 한다.
- Favorite·Statistics·Settings에서는 More 탭이 활성 상태로 보이게 한다.
- Calendar 전용 전체 높이 레이아웃을 위해 `AppShell`에 선택적 `fillViewport` 속성을 추가한다.

### 월간 달력

- 상단에 44px 이전 달 화살표, 네이티브 연·월 선택기, 44px 다음 달 화살표를 둔다. 네이티브 선택기의 터치 영역은 보이는 월 제목 너비로 제한해 양쪽 화살표와 겹치지 않게 한다.
- 요일은 `MON → SUN` 순서로 표시하고 접근성 이름도 `Monday → Sunday`의 영어 전체 요일을 제공한다.
- 월 제목, 월 이동·선택, 상태 메시지, 날짜 접근성 이름, 복수 착장 선택 시트를 포함한 Calendar UI는 영어로 표시한다. 저장된 착장명·장소명 같은 사용자 데이터는 원문을 유지한다.
- 달력은 최소 5주, 최대 6주로 생성한다. 4주만 필요한 달에도 앞뒤 날짜를 포함해 5주를 유지한다.
- 앞뒤 달 날짜는 흐린 숫자만 표시하고 해당 날짜의 착장은 표시하지 않는다.
- 오늘 날짜는 원형 테두리로, `?date=`로 진입한 날짜는 셀 배경으로 구분한다.
- 기록이 없는 달에도 달력 자체는 유지하며 전체 화면 Empty State로 교체하지 않는다.
- 날짜 행은 92px 고정 높이를 사용한다. 날짜 숫자 영역은 20px로 압축하고, 남은 영역의 착장 wrapper는 셀 너비를 활용하되 최대 52px와 3:4 비율을 유지한다. `transform` 확대 없이 실제 wrapper 크기를 키우며 달력 아래 남는 공간은 억지로 채우지 않는다.

### 날짜별 착장

- 하루 한 기록이면 Outfit 썸네일 전체를 `/outfits/:outfitId` 링크로 사용한다.
- 하루 두 기록 이상이면 첫 착장과 `+N` 배지를 표시하고, 탭하면 날짜 제목과 모든 착장을 보여주는 하단 선택 시트를 연다.
- 선택 시트 항목은 Outfit 썸네일·이름·필요한 최소 구분 정보만 제공하며 각각 기존 Outfit 상세로 연결한다.
- 선택 시트는 닫기 버튼, 바깥 영역 탭, Escape 키를 지원하고 열었던 날짜 셀로 focus를 돌려준다.
- Calendar에서는 아이템 단독 기록, 새 착장 추가, 기록 수정·삭제 기능을 제공하지 않는다.

### 기록 관리와 상태

- Outfit 상세의 착용 이력 각 행에 `수정`과 `삭제`를 함께 배치한다.
- 삭제는 해당 기록 안에서 명시적 확인을 받은 뒤 기존 `deleteWearLog` 계약을 사용하며, Outfit 자체는 변경하지 않는다.
- 삭제 후 착용 횟수·최근 착용일·추천 근거·통계가 현재 데이터로 다시 계산되게 한다.
- 기존 `/calendar?date=YYYY-MM-DD` 진입을 유지한다.
- 월을 직접 이동하면 `?month=YYYY-MM`을 기록해 Outfit 상세에서 뒤로 돌아왔을 때 같은 달을 복원한다.
- 날짜·요일 계산은 KST 날짜 문자열과 UTC 기반 순수 함수로 구현하며 새 날짜 라이브러리는 추가하지 않는다.
- DB schema, Supabase RPC, Storage, Wear Log 데이터 구조는 변경하지 않는다.

### 문서화

- Phase 3.5 전용 계획 문서를 추가하고 Calendar·Navigation 변경의 기준 문서로 사용한다.
- Roadmap의 오래된 현재 위치를 수정하고 Phase 3 완료와 Phase 3.5 진행, Phase 4 P4-0 대기를 명시한다.
- 기존 Phase 1 내비게이션·Calendar 명세에는 Phase 3.5가 해당 부분을 대체한다는 안내를 남긴다.
- 구현 완료 후 `docs/devlog/2026-08-02.md`에 변경 이유, UI 결정, 검증 결과, 남은 제한을 한국어로 기록한다.

## Interface Changes

- `AppShell`: 선택적 `fillViewport?: boolean` 추가.
- Calendar URL:
  - `date=YYYY-MM-DD`: 저장 직후 또는 특정 기록 날짜 강조.
  - `month=YYYY-MM`: 사용자가 탐색 중인 월 복원.
  - 우선순위는 유효한 `date` → 유효한 `month` → KST 오늘이다.
- 기존 route와 repository API는 그대로 유지한다.

## Test Plan

- 월요일 시작, 윤년, 월 경계, 5주·6주 및 4주 달의 5주 보정 계산을 단위 테스트한다.
- 단일 착장 직접 이동, 복수 착장 선택 시트, 앞뒤 달 착장 비노출, 빈 달 격자 유지, 오늘·대상 날짜 강조를 검증한다.
- 이전·다음·연월 선택과 `date`/`month` URL 복원을 검증한다.
- Favorite의 More 이동, 새 하단 메뉴 순서와 각 하위 화면의 활성 탭을 검증한다.
- Outfit 상세에서 Wear Log 수정·삭제와 삭제 후 집계 갱신을 검증한다.
- 390×844, 작은 iPhone 높이, 430px대 모바일 및 760px 화면에서 5주·6주 달력과 착장 wrapper의 3:4 비율을 시각 확인한다.
- 하단 메뉴 겹침, 가로 overflow, 긴 Outfit 이름, 키보드 focus, 선택 시트 닫기, safe-area를 확인한다.
- 전체 TypeScript 검사, Vitest, production build, Pages artifact 검증을 실행한다.

## Assumptions

- UI는 기존 흑백 디자인과 현재 `OutfitVisual`의 실시간 composition·fallback을 재사용한다.
- 주 시작 요일은 설정값이 아니라 항상 월요일이다.
- 달력 아래에는 월간 목록이나 선택 날짜 상세를 두지 않는다.
- 착장 추가는 기존 Outfit 상세 흐름을 사용하고 Calendar에 별도 추가 버튼을 만들지 않는다.
- 하루 복수 착장은 예외 흐름으로 지원하되 기본 달력 밀도를 높이지 않는다.

## Implementation Status

- 하단 탭을 `HOME → CALENDAR → CLOSET → LOOKBOOK → MORE`로 변경하고 Favorite를 More 첫 항목으로 이동했다.
- 월요일 시작 5주·6주 달력, 단일 착장 직접 연결, 복수 착장 선택 시트, Outfit 상세 Wear Log 삭제를 구현했다.
- TypeScript 검사, 전체 Vitest 49개 파일·220개 테스트, production build, GitHub Pages artifact 검사를 통과했다.
- 390×844 브라우저에서 5주·6주 달력, 월 이동, 단일 착장 연결, 복수 착장 선택 시트, console warning·error 부재를 확인했다. 월 선택기와 화살표의 겹침은 0이며 착장 wrapper는 약 49.15×65.20px의 3:4 비율로 표시된다.
- DB schema, Supabase 원격 환경, 공개 앱은 변경하지 않았다. commit·push·배포는 별도 작업으로 남긴다.
