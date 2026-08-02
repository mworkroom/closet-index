# Outfit Item 크기 조절 UI Design QA

## Evidence

- Source visual truth: `C:\Users\Marion\Desktop\IMG_0259.PNG`
- Browser-rendered implementation: `C:\Users\Marion\AppData\Local\Temp\closet-index-scale-controls-mobile.png`
- Focused source crop: `C:\Users\Marion\AppData\Local\Temp\closet-index-scale-source.jpg`
- Focused implementation crop: `C:\Users\Marion\AppData\Local\Temp\closet-index-scale-implementation.jpg`
- Side-by-side comparison: `C:\Users\Marion\AppData\Local\Temp\closet-index-scale-comparison.jpg`
- Viewport: 390×844 CSS px
- Source pixels: 1170×2532, iPhone 3× capture
- Implementation screenshot pixels: 375×811, in-app browser viewport content
- Density normalization: Item 선택 grid와 조정 card를 각각 375×538px로 정규화해 비교
- State: Korshavn Cardigan 선택 후 5% 확대, 좌우 0px·상하 0px·크기 105%

## Full-view Comparison

원본은 iPhone Safari chrome을 포함하고 구현 캡처는 앱 viewport만 포함하므로 앱 소유 영역을 기준으로 비교했다. Item 선택 grid, 선택 Item 제목, 좌표·크기 표시, 조정 control, 저장 버튼, 하단 메뉴의 기존 순서와 스타일이 유지됐다. 브라우저 chrome 차이는 제품 UI 차이로 평가하지 않았다.

## Focused-region Comparison

원본에서 표시한 축소·확대 위치와 구현의 `− / 화살표 pad / +` 배치가 일치한다. 390px viewport에서 control card 폭은 335.2px, 전체 control pad 폭은 264px이며 가장 바깥 버튼도 card 내부에 남는다. 확대 후 선택 Item의 미리보기 폭은 68.8889%에서 72.3333%, 높이는 30.8492%에서 32.3917%로 변했고 표시값은 105%로 갱신됐다.

## Findings

- P0/P1/P2 없음.
- P3: 원본의 빨간 원은 위치 설명용 손그림 annotation으로 판단해 제품 UI에는 재현하지 않았다. 실제 버튼은 기존 `icon-button` 시각 언어를 유지했다.

## Required Fidelity Surfaces

- Fonts and typography: 기존 앱 글꼴·굵기·좌표 text hierarchy를 유지했고 크기 퍼센트만 같은 행에 추가했다.
- Spacing and layout rhythm: 축소·화살표·확대를 한 행에 배치했으며 mobile horizontal overflow가 없다.
- Colors and visual tokens: 기존 `--surface`, `--surface-soft`, `--line`과 button 상태를 재사용했다.
- Image quality and asset fidelity: 기존 signed Item cutout을 그대로 사용하며 확대 시 CSS 합성 크기만 변경한다.
- Copy and content: `위치 4px · 크기 5%`, `크기 105%`, `이 조정 저장`으로 동작 범위를 명시했다.

## Interaction and Runtime Checks

- `+` 1회 클릭 시 선택 Item만 105%로 확대됨.
- 저장 전 미리보기만 바뀌며 원격 데이터 행은 변경하지 않음.
- 경고·오류 console log 없음.
- 하단 메뉴와 control card의 겹침 없음.

## Comparison History

첫 비교에서 actionable P0/P1/P2 차이가 없어 수정 반복은 필요하지 않았다.

## Follow-up Polish

- 실제 iPhone에서 50%·150% 경계 상태의 버튼 disabled 대비를 필요하면 추가 확인한다.

final result: passed

---

# Phase 3.5 Calendar Design QA

- Source reference: `C:\Users\Marion\Desktop\IMG_0739.PNG` (J가 제공한 기존 앱 Calendar 캡처, 946×2048)
- Implementation screenshot: `C:\Users\Marion\.codex\visualizations\2026\08\02\019fc014-d468-7f02-8c4c-87f87a47235a\calendar-phase-3-5-mobile.png`
- Multiple-outfit screenshot: `C:\Users\Marion\.codex\visualizations\2026\08\02\019fc014-d468-7f02-8c4c-87f87a47235a\calendar-multiple-outfits-sheet.png`
- Six-week screenshot: `C:\Users\Marion\.codex\visualizations\2026\08\02\019fc014-d468-7f02-8c4c-87f87a47235a\calendar-six-week-mobile.png`
- Viewport: 390×844 CSS px, device scale은 브라우저 기본값
- State: demo data, April 2026 5-week month / March 2026 6-week month

## Comparison Method

제공된 원본 캡처와 390×844 구현 캡처를 같은 검토 입력에서 전체 화면 기준으로 비교했다. 원본 파일은 최초 캡처 확인 뒤 지정 경로에서 사라져 재생성 가능한 병합 이미지는 남기지 못했지만, 원본 첨부 화면과 구현 캡처를 함께 보며 구조·밀도·간격·착장 식별성을 판단했다. 복수 착장 시트는 원본에 대응 화면이 없어 구현 화면 자체의 모바일 레이아웃과 조작성을 별도로 확인했다.

## Intentional Differences

- 원본의 `SUN → SAT`를 요구사항에 따라 `MON → SUN`으로 변경했다.
- 원본의 선택 날짜 상세·추가 버튼 영역을 제거하고 달력이 남는 높이를 사용하게 했다.
- 앱의 현재 디자인 시스템과 하단 전면 메뉴를 유지했다.
- 날짜 하나에 기록 하나면 썸네일에서 Outfit 상세로 바로 연결하고, 둘 이상일 때만 `+N` 선택 시트를 사용한다.
- Calendar chrome과 접근성 이름은 영어로 통일하고 저장 데이터의 고유 이름은 원문을 보존했다.

## Findings and Fix History

- P0: 없음.
- P1: 없음.
- P2: 초기 CSS의 주 수 계산식은 구형 모바일 Safari 호환성이 불명확해 5주·6주 명시 클래스로 교체했다.
- 5주와 6주 화면 모두 390×844에서 `scrollHeight=844`로 하단 메뉴와 겹치지 않았다.
- 월 제목, 요일, 이전·다음 월, 월 선택, 복수 착장 선택 시트의 UI와 접근성 이름이 영어로 표시됐다.
- 착장 이미지는 셀 안에서 잘리지 않고 날짜 숫자와 구분됐으며, 인접 월에는 흐린 숫자만 남았다.
- 브라우저 console warning·error는 없었다.

## Follow-up QA — Date Cell Background

- Source visual truth: J의 `#f0f0f0` 지정과 Lookbook의 `--surface-soft` 배경
- Before screenshot: `C:\Users\Marion\.codex\visualizations\2026\08\02\019fc014-d468-7f02-8c4c-87f87a47235a\calendar-before-cell-background.png`
- After screenshot: `C:\Users\Marion\.codex\visualizations\2026\08\02\019fc014-d468-7f02-8c4c-87f87a47235a\calendar-after-cell-background.png`
- Lookbook aspect reference: `C:\Users\Marion\.codex\visualizations\2026\08\02\019fc014-d468-7f02-8c4c-87f87a47235a\lookbook-aspect-reference.png`
- Viewport: 404×894 CSS px, browser default density
- State: April 2026 demo data, 월간 달력과 Lookbook 3열 grid
- Full-view comparison: 수정 전 흰 날짜 칸 안에 `#f0f0f0` 착장 합성 배경이 직사각형으로 보였고, 수정 후 일반 날짜 칸과 합성 배경이 모두 `rgb(240, 240, 240)`으로 이어진다. URL 대상 날짜의 기존 강조색은 상태 표현으로 유지했다.
- Focused comparison: 실제 computed style에서 일반 날짜 칸 3개의 배경과 착장 합성 배경이 모두 `rgb(240, 240, 240)`이었다. 색상 외 타이포그래피, 간격, 테두리, 영문 copy는 변경하지 않았다.
- Aspect diagnosis: Lookbook은 110.66×147.55px로 3:4 비율이지만 Calendar 합성 영역은 47.09×90.38px로 약 0.52:1이다. Calendar가 셀의 남은 높이를 `height: 100%`로 채우고 `.outfit-visual__layered`의 3:4 비율을 `aspect-ratio: auto`로 덮기 때문에 합성 좌표계가 세로로 길어진다. J는 원인을 질문했으며 이번 색상 변경 범위에서는 비율 코드를 변경하지 않았다.
- Browser checks: 의미 있는 Calendar DOM, overlay 없음, console warning·error 없음, `April → May → April` 월 이동 정상.
- Findings: 요청한 배경색 변경에는 P0/P1/P2 없음. Calendar 합성 비율 통일은 별도 후속 선택 항목이다.
- Comparison history: 첫 후속 비교에서 날짜 칸과 합성 배경의 색상 불일치를 확인해 `var(--surface)`를 `var(--surface-soft)`로 변경했고, 재비교에서 같은 `#f0f0f0` computed color를 확인했다.

## Follow-up QA — Lookbook 3:4 Calendar Ratio

- Source visual truth: Lookbook의 `.outfit-card__visual` 3:4 비율과 J의 Calendar 3:4 고정 요청
- Before screenshot: `C:\Users\Marion\.codex\visualizations\2026\08\02\019fc014-d468-7f02-8c4c-87f87a47235a\calendar-after-cell-background.png`
- After screenshot: `C:\Users\Marion\.codex\visualizations\2026\08\02\019fc014-d468-7f02-8c4c-87f87a47235a\calendar-3x4-final-404x894.png`
- Mobile screenshot: `C:\Users\Marion\.codex\visualizations\2026\08\02\019fc014-d468-7f02-8c4c-87f87a47235a\calendar-3x4-final-390x844.png`
- Six-week screenshot: `C:\Users\Marion\.codex\visualizations\2026\08\02\019fc014-d468-7f02-8c4c-87f87a47235a\calendar-3x4-final-six-week-390x844.png`
- Viewport and density: 전후 비교 404×894 CSS px, 모바일 확인 390×844 CSS px, 브라우저 기본 density
- State: April 2026 5주 달력과 March 2026 6주 달력, demo data
- Full-view comparison: 날짜 행이 화면 남은 높이를 채우던 구조를 92px 고정 행으로 바꿔 5주 달력 아래에 의도한 공백이 생겼다. 하단 메뉴, 월 제목, 요일, 날짜 숫자와 셀 테두리는 유지됐다.
- Focused comparison: Calendar 착장 wrapper는 404px viewport에서 47.09×61.20px, 390px viewport에서 45.15×60.20px로 계산됐고 computed `aspect-ratio`는 `3 / 4`였다. Lookbook과 같은 좌표계 비율이므로 세로 늘어짐이 사라졌다.
- Six-week comparison: 390×844에서 6개 행은 총 552px, 달력과 하단 메뉴 사이 공백은 39.8px였으며 문서 높이도 844px로 추가 스크롤이 생기지 않았다.
- Required fidelity surfaces: 기존 글꼴·간격·`#f0f0f0` 색상·실제 cutout asset·영문 Calendar copy를 유지했다. 변경은 행 높이와 합성 wrapper 비율에 한정했다.
- Browser checks: 페이지 identity와 의미 있는 DOM 정상, framework overlay 없음, console warning·error 없음, `April → March → April` 월 이동 정상, 모든 Calendar 이미지 load 완료.
- Findings: P0/P1/P2 없음.
- Comparison history: 초기 Calendar wrapper 47.09×90.38px의 약 0.52:1 비율을 확인한 뒤 grid의 flex 확장을 제거하고 행을 92px로 고정했다. wrapper에 3:4 비율과 최대 48px 너비를 적용한 재비교에서 5주·6주 달력 모두 비율과 하단 여백이 정상임을 확인했다.

final result: passed
