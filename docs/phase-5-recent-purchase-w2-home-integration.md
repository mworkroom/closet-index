# Phase 5 Recent Purchase W2 Disabled HOME Integration

## Scope and status

W2 is the selected disabled Recent Purchase candidate for local QA. It combines N3 source semantics, a 365-day KST calendar window, and M-A missing-context behavior after the existing recommendation and partition calculations.

- The development flag is `VITE_P5A_RECENT_PURCHASE_W2`.
- The flag defaults to false and cannot activate in a production build.
- The previous C1 calculator, fixtures, audit, and integration record remain as a strict historical control.
- HOME wording, controls, CSS, Supabase data/schema, migrations, Item dates, Purchase Events, Wear Logs, and production defaults are unchanged.

## Why 365 days was selected

Recent Purchase means that a valid novelty-source Item entered the wardrobe within the last 365 calendar days. It does not mean that an old Item merely has few Wear Logs, and repurchase or replenishment does not reset the clock.

The 365-day window gives a seasonal Item one full annual cycle and a chance to reach the next comparable weather. The former 180-day model remains an audit comparison only. An 18-month window is not used. A future under-tested or low-wear feature would have a different purpose and must not be folded into Recent Purchase.

## W2 contract

The existing observed-Outfit and overall direct OK-temperature membership gate runs first. Existing season, archive, retirement, rating, rain, long-walk, reasons, warnings, and recommendation levels are preserved.

N3 then applies these source rules:

- initial acquisition or handmade completion supplies novelty;
- source age is calculated from KST calendar dates;
- age 365 days is eligible and age 366 days is expired;
- Purchase Events and replenishment do not reset novelty;
- all existing source exclusions remain;
- exact `Top-T-shirts-innerwear` cannot be a source, while the Outfit can use another valid source Item;
- selection is distinct Item-first, one Outfit appears once, and at most three cards are returned;
- expired, duplicate, repurchased, or ineligible sources never fill an empty slot.

With complete Place and Transport, tier order is exact support, current-Transport support, cross-context-only, and unknown exploration. Exact issue and exact mixed are ineligible. Inferred return endpoints cannot create support or issue. Within a tier, order is novelty date descending, baseline Outfit rank, then deterministic IDs.

With missing Place or Transport, M-A still applies the 365-day window, N3, and existing overall-temperature eligibility. It creates no exact or Transport support and does not hide the section solely because context is incomplete.

## Partition preservation

The adapter receives the already calculated baseline partition.

- Feature off returns the exact baseline partition object and the same recent, normal, and trial arrays.
- Feature on reconstructs only Recent Purchase.
- Non-selected observed Outfits return to normal recommendations in original baseline order.
- Trial recommendations retain their existing array identity.
- RecommendationResult objects, reasons, warnings, levels, and membership are not mutated.
- Zero, one, two, and three cards are all valid; zero cards hide the existing section without new wording.

## SELECT-only production comparison

The 2026-08-08 KST snapshot produced the expected result. Labels remain anonymized in this tracked document.

| Input | W2 cards | Source ages | Selected tiers | Duplicate source / Outfit | Candidate loss |
| --- | ---: | --- | --- | ---: | ---: |
| nearby A · short walk · 26°C | 3 | 36, 47, 50 days | cross-context ×3 | 0 / 0 | 0 |
| nearby A · short walk · 28°C | 2 | 50, 67 days | cross-context ×2 | 0 / 0 | 0 |
| nearby A · short walk · 30°C | 0 | none | none | 0 / 0 | 0 |
| nearby A · short walk · 33°C | 0 | none | none | 0 / 0 | 0 |
| cinema A · Car · 33°C | 0 | none | none | 0 / 0 | 0 |
| Place null · short walk · 33°C | 0 | none | M-A, no recent source | 0 / 0 | 0 |
| nearby A · Transport null · 33°C | 0 | none | M-A, no recent source | 0 / 0 | 0 |

At 28°C one 403-day W0 card graduated to normal rank 4. At 30°C all three W0 cards graduated to normal ranks 8, 9, and 18. At both 33°C nearby and cinema inputs, all three graduated to normal ranks 1, 3, and 4. The old exact-supported outerwear Outfit is among the expired cards and remains available in normal recommendations.

Production feature-off groups were deeply equal and object/array-identical to the baseline. Feature-on candidate loss, duplicate source count, and duplicate Outfit count were all zero.

## Fixtures and rendering

The 22 W2 integration fixtures cover 365/366/250-day boundaries, tier ordering, cross-context and unknown exploration, exact issue/mixed exclusion, repurchase, innerwear sourcing, source/Outfit deduplication, zero and two valid sources, normal graduation, M-A, feature-off identity, production forced-false behavior, and duplicate-row/input-order determinism.

The existing Recent Purchase component contract still renders 0, 1, 2, or 3 cards without placeholders. In authenticated desktop and 390×844 mobile QA, feature off retained three cards for all seven inputs; W2 on rendered 3, 2, 0, and 0 cards at nearby 26/28/30/33°C and zero for cinema+Car and both missing-input 33°C cases. The mobile page width stayed within the viewport, and no framework overlay or console warning/error appeared.

The in-app browser's viewport override did not change its actual 1280×720 page viewport, so that attempt was not counted as mobile evidence. The completed mobile pass used an authenticated Chrome session whose page reported a 390×844 CSS viewport; a full-page screenshot and DOM geometry confirmed the responsive layout.

## Remaining decisions

- Production activation remains explicitly out of scope.
- W2 is ready for deliberate local opt-in QA, but the repository flag remains default false.
- HOME source/evidence wording remains a separate UI decision.
- A future under-tested Item feature must remain separate from the 365-day novelty contract.
