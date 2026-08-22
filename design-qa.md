# Replacement Lineage Connection Editing Design QA

## Evidence

- Source visual truth: `C:/Users/Marion/Desktop/IMG 005.png`
- Supporting prototype: `C:/Users/Marion/AppData/Local/Temp/codex-clipboard-41b24963-9129-44dc-88ee-69fa24fd9f21.png`
- Implementation route: `http://127.0.0.1:5173/replacement-lines/361f66af-29b2-80f9-88ce-cb9e0eb09b6a`
- Desktop implementation screenshot: `C:/Users/Marion/.codex/visualizations/2026/08/02/019fc39b-4007-7d02-b2d2-f879b2f0d060/closet-index-lineage-left-branches.png`
- Mobile implementation screenshot: `C:/Users/Marion/.codex/visualizations/2026/08/02/019fc39b-4007-7d02-b2d2-f879b2f0d060/closet-index-lineage-left-branches-mobile-viewport.png`
- Connection edit screenshot: `C:/Users/Marion/.codex/visualizations/2026/08/02/019fc39b-4007-7d02-b2d2-f879b2f0d060/closet-index-lineage-edit-form.png`
- Combined comparison: `C:/Users/Marion/.codex/visualizations/2026/08/02/019fc39b-4007-7d02-b2d2-f879b2f0d060/closet-index-lineage-branch-comparison.png`

## Normalization

- Source pixels: 1045 × 1097, 72 dpi.
- Desktop implementation pixels: 1264 × 1694, 72 dpi.
- Desktop CSS viewport: the Codex in-app browser default viewport; full-page capture used.
- Mobile CSS viewport: 390 × 844; viewport capture used.
- Density normalization: both desktop comparison panels were resized to 700 px width while preserving aspect ratio. The dynamic content differs below the shared Black Skirt branch region, so judgment is limited to the matching G0 and G1 region.
- State: authenticated Black Skirt lineage with two G0 items and two G1 branch groups. The connection edit state was separately captured on Black Cardigan.

## Full-view Comparison Evidence

The implementation keeps the prototype's light card surfaces, compact item rows, equal image slots, generation headers, and status pills. For the user-marked branch case, the two G1 cards are indented and joined by a continuous rail with horizontal elbows on the left, instead of drawing branch marks inside or over the cards.

## Focused Region Comparison Evidence

The combined comparison focuses on the matching G0-to-G1 Black Skirt region because that is where the requested connector placement is visible. A separate connection-edit screenshot verifies the predecessor selector, the three decision-reason options, the optional branch name, and the detach affordance. No additional crop was needed because both the connector rail and item-card controls remain readable in these captures.

## Findings

- No actionable P0, P1, or P2 difference remains for the requested scope.
- Typography: the implementation preserves the existing app type scale and hierarchy rather than copying the prototype's larger editorial scale; this is an intentional consistency choice.
- Spacing and layout: the desktop branch rail matches the marked left-side placement. At 390 px the indent is reduced and measured content stays inside the viewport.
- Colors and tokens: neutral cards, dividers, muted metadata, status colors, and danger treatment use the existing Closet Index tokens with adequate separation.
- Image quality: real Closet Index item images are reused with consistent crops and no placeholder or generated substitutes.
- Copy and content: edit labels and reasons are concise, and `계보에서 빼기` opens a confirmation explaining that the Item becomes a start in the same Line.
- Interaction and accessibility: native selects expose their options, save remains disabled until a valid change exists, detach requires a second confirmation, and browser console error/warning count was zero.

## Comparison History

- Pass 1: no P0/P1/P2 finding. No visual correction iteration was required after the combined comparison.

## Residual Test Gaps

- Browser QA intentionally did not submit an update or detach action against J's live lineage data. The production RPCs were instead verified with a transaction rollback fixture covering update, stale concurrency rejection, detach, explicit-start creation, and nonmember rejection; the live row counts and checksums were unchanged afterward.

## Final Result

final result: passed

---

# Item Detail Action and Wish Design QA

## Evidence

- Source visual truth: `C:/Users/Marion/Desktop/IMG_0846.PNG`
- Implementation route: `http://127.0.0.1:5191/closet/item-cardigan`
- Mobile implementation screenshot: `C:/Users/Marion/.codex/visualizations/2026/08/22/01a02a70-13c5-7b13-9520-9a4e529d4479/closet-item-detail-mobile.png`
- Wish Item screenshot: `C:/Users/Marion/.codex/visualizations/2026/08/22/01a02a70-13c5-7b13-9520-9a4e529d4479/closet-wish-item-mobile.png`
- Desktop implementation screenshot: `C:/Users/Marion/.codex/visualizations/2026/08/22/01a02a70-13c5-7b13-9520-9a4e529d4479/closet-item-detail-desktop.png`

## Normalization

- Source pixels: 1170 × 2532.
- Mobile CSS viewport: 390 × 844; viewport and full-page captures used.
- Desktop CSS viewport: 1280 × 900; viewport capture used.
- State: Demo mode Item detail, Add Outfit, and Closet filters. A local no-purchase-date QA Item was created to exercise the Wish state without touching live data.
- Comparison scope: the source visual is a placement sketch rather than a complete restyle request, so the comparison focuses on the top action removal and the two-button row below Item usage stats.

## Full-view Comparison Evidence

The implementation removes the header-level edit action that competed with long Item names and places `새 착장 만들기` and `정보 수정` directly below the three usage stats. The new row follows the existing Closet Index button, spacing, icon, and corner-radius system instead of copying the source application's visual tokens.

## Findings

- No actionable P0, P1, or P2 visual difference remains for the requested scope.
- Layout: both actions remain side by side at 390 px with no horizontal overflow; measured document width stayed within the viewport.
- Hierarchy: `새 착장 만들기` is the primary filled action and `정보 수정` is the secondary outlined action, matching their expected frequency and consequence.
- Wish state: an Item with no purchase date shows a compact `구매 전` badge on detail and card surfaces. The Closet card uses it as the primary badge when another maintenance badge also applies.
- Interaction: `새 착장 만들기` opened `/outfits/new?item=...` with the source Item already selected and its category active. The Closet list placed the no-date Item first, and enabling `Wish` reduced the Demo result to that Item.
- Accessibility: the action row has an `Item 작업` navigation label, Wish cards announce `구매 상태 구매 전`, and the native Wish checkbox exposes checked state.
- Browser quality: desktop and 390 × 844 mobile states rendered without an error overlay; console error and warning counts were zero.

## Comparison History

- Pass 1: no P0/P1/P2 finding. The requested action placement and compact mobile behavior matched the source intent without a visual correction iteration.

## Residual Test Gaps

- Browser QA used local Demo data. The authenticated Supabase flow and deployed mobile browser were not exercised in this task.

## Final Result

final result: passed
