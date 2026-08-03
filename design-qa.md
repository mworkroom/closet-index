# Replacement Lineage Design QA

## Comparison Target

- Source visual truth: `C:\Users\Marion\AppData\Local\Temp\codex-clipboard-9aded771-17de-4c4c-a041-b3f0cb97d9ec.png`
- Implementation screenshot: `C:\Users\Marion\.codex\visualizations\2026\08\02\019fc39b-4007-7d02-b2d2-f879b2f0d060\phase4-lineage-black-hoodie-mobile-viewport.png`
- Source state: `ITEM LINEAGE · Ivory Layered` reference with G0, a multi-row G1 card, and predecessor-specific G2 cards.
- Implementation state: signed-in production `Black Hoodie Winter` with confirmed G0→G1→G2 edges. Item names, counts, images, years, reasons, and statuses intentionally use real production data instead of the reference fixture.

## Viewport And Normalization

- Browser viewport override: 390 × 844 CSS px.
- Effective app capture: 375 × 811 px at device scale factor 1.
- Source image: 864 × 1821 px.
- Density normalization: source scaled to 375 px width is approximately 375 × 790 px. The implementation capture was compared at the same 375 px content width; the remaining height difference is real-content length, not device chrome.
- Desktop confirmation: 862 × 1200 viewport, effective width 847 px, no horizontal overflow.

## Full-view Comparison Evidence

- Information architecture matches the source: back control, `ITEM LINEAGE`, Line name, Active/Retired summary, rounded generation groups, equal thumbnail slots, edge-derived G labels, item metadata, reason, and status badge.
- The vertical connector stays aligned with the thumbnail column and reads top-to-bottom without horizontal scrolling.
- Production content is shorter than the reference fixture, but the G0·G1·G2 composition, density, hierarchy, card proportions, border treatment, and muted status palette remain faithful.
- The separate production `Navy Blouse Summer` check renders one G0 predecessor and two real G1 successors in a single equal-row candidate card.
- Focused-region comparison was not required: at original capture size the header, generation labels, thumbnails, reasons, and badges are all readable in the full-view evidence. DOM and computed-layout checks additionally confirmed badge bounds and title/summary alignment.

## Required Fidelity Surfaces

- Fonts and typography: existing Pretendard stack retained; eyebrow tracking, compact bold generation labels, item hierarchy, wrapping, and small metadata match the source character. Long Korean names wrap without clipping.
- Spacing and layout rhythm: title and summary share the same x-axis; mobile generation cards occupy approximately 81% of the effective width, matching the source proportion; card/header/row spacing is consistent.
- Colors and visual tokens: existing white, soft grey, line grey, muted ink, pale green Active badge, and neutral Retired badge map closely to the source and preserve text labels in addition to color.
- Image quality and asset fidelity: real stored Item cutout images are reused with `object-fit: contain`; no placeholder, generated substitute, or reconstructed product image is used. All generations use the same thumbnail dimensions.
- Copy and content: generation text, `사용 중`, `Retired`, acquisition year, and `선택 이유` are sourced from actual app data. The reference-only `1벌` and future `이어짐` state are not invented where the data model has no such value.

## Findings And Comparison History

### Iteration 1

- [P2] The Active/Retired summary initially started at the page edge instead of aligning under the Line title. It was moved into the shared topbar subtitle slot.
- [P2] Mobile generation cards initially used the full standard page width and appeared wider than the reference. A 16 px inner mobile margin was added while retaining the existing desktop frame.
- [P1] During the independent DataProvider load, the page could briefly show `Replacement Line을 찾을 수 없습니다.` before Item data arrived. The not-found state now requires loaded app data, so the loading state remains stable.

### Iteration 2

- The revised mobile capture aligns the title and summary at x=74 px.
- Generation cards render at x=36 px with 303.2 px width inside the effective 375 px app width, matching the reference proportion.
- No actionable P0, P1, or P2 visual difference remains. Content differences are expected production-data differences.

## Browser Verification

- Page identity: `Closet Index` at `/replacement-lines/:lineId`.
- Meaningful DOM: production G0, G1, and G2 headings and Item links rendered.
- Framework overlay: none.
- Console warning/error: none on desktop, mobile, branch, and final revised captures.
- Responsive layout: desktop and 390 × 844 mobile override; `scrollWidth === clientWidth` in both checks.
- Interaction: Replacement Lines Overview → expand `Black Hoodie Winter` → `계보 보기` → G0·G1·G2 render → Item row → Item detail URL → browser back → lineage restored.
- Data boundary: `Ivory Layered` shows two connected generation cards and eight `계보 연결 전` membership rows instead of inventing eight additional G0 roots.

## Follow-up Polish

- P3: If a future data model adds a planned-successor state, add the outlined `이어짐` badge shown in the reference. Do not infer it from current Active Items.

final result: passed
