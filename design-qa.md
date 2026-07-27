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
