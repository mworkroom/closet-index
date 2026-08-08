# Phase 5 Recent Purchase Novelty-Source Eligibility Validation

## Scope

This validation replays Recent Purchase membership after the production acquisition and repurchase data were corrected. It is SELECT-only and does not connect N2 or N3 to HOME. No production data, recommendation behavior, feature flag, UI, migration, or schema is changed.

The earlier semantics audit captured a historical state in which a legacy Notion workflow had stored a repurchase date in `acquired_on`. That was a data-provenance issue, not a defect in the current application's separate Item acquisition and Purchase Event write paths. The current production records now keep old Item acquisition dates in `acquired_on` and later repurchases in Purchase Events.

## Authoritative correction overlay

The simulation applies a human-confirmed overlay without changing general Item data:

- anonymized Item A: confirmed initial novelty 2024-06-27 and repurchase 2026-05-14;
- anonymized Items B and C: known old Items whose later recorded dates are repurchases; their unknown original dates are not invented and they are not new-Item novelty sources;
- every active exact `Top-T-shirts-innerwear` Item: novelty-source ineligible;
- all other Items retain their current `acquired_on` semantics.

Production currently stores Item A `acquired_on` as 2024-06-21 and its Purchase Event as 2026-05-14. Because the human-confirmed initial date for this simulation is 2024-06-27, the overlay uses 2024-06-27 and records the six-day production discrepancy without writing either value.

## Item membership versus novelty-source eligibility

Excluding an Item as a novelty source does not remove the Item or its Outfit:

- the Item remains in the Outfit relation;
- its Wear Logs, wear count, images, and temperature evidence remain intact;
- the Outfit remains recommendation-eligible;
- the Outfit may appear in Recent Purchase when another valid Item is its source.

Only the source role is excluded: `latestAcquiredItem`, novelty anchor, and one of the distinct represented new Items.

## Current exact category logic

The current recommendation helper trims and lowercases the category, then checks exact membership in this exclusion set:

- `Innerwear`
- `Socks`
- `Acc-Neck`
- `Acc-Waist`
- `Acc-Head-made`
- `Acc-Hands-made`

Current production category values allowed by that exact rule are:

- `Acc-Neck-made`
- `Bags`
- `Bags-made`
- `Bottom-Knitwear`
- `Bottom-Pants`
- `Bottom-Skirts`
- `Dress`
- `Outer-Cardigan`
- `Outer-Cardigan-made`
- `Outer-Coat`
- `Outer-Jacket`
- `Outer-Jumper`
- `Outer-Vest`
- `Outer-Vest-made`
- `Shoes`
- `Top-Blouse`
- `Top-Hoodies`
- `Top-Knitwear`
- `Top-MTM`
- `Top-Sweater-made`
- `Top-T-shirts`
- `Top-T-shirts-innerwear`

Therefore the exact current bug is confirmed: `Top-T-shirts-innerwear` is allowed as a Recent Purchase source. N3 adds only that exact normalized category to the source exclusion set. It does not use a broad `contains("innerwear")` rule and does not exclude unrelated categories.

## Production category audit

Counts are shown as 26°C / 28°C / 33°C. “Eligible Outfit” means a temperature-eligible observed Recent Purchase candidate. “Current source” means the category supplies the Outfit's current maximum `acquired_on`. “Top-three anchor” is the final N0 source.

| Category | Active Items | Eligible Outfits | Current source occurrences | N0 top-three anchors | Current source allowed | N3 source allowed |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `Acc-Hands-made` | 2 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | no | no |
| `Acc-Head-made` | 2 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | no | no |
| `Acc-Neck` | 3 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | no | no |
| `Acc-Neck-made` | 11 | 1 / 1 / 0 | 1 / 1 / 0 | 0 / 0 / 0 | yes | yes |
| `Acc-Waist` | 2 | 2 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | no | no |
| `Innerwear` | 6 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | no | no |
| `Socks` | 9 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | no | no |
| `Top-T-shirts-innerwear` | 36 | 12 / 10 / 1 | 6 / 5 / 1 | 0 / 0 / 1 | yes | no |

## N0–N3 definitions

- N0: current production Outfit-first selection using current `acquired_on`; duplicate source Items are allowed and `Top-T-shirts-innerwear` is allowed.
- N1: authoritative initial/repurchase corrections, still Outfit-first, current category rules unchanged.
- N2: N1 evidence with distinct Item-first selection; one card per source Item and one source per Outfit; fewer than three is allowed.
- N3: N2 plus exact `Top-T-shirts-innerwear` source exclusion. Outfit membership remains unchanged.

Direct-context ranking, Policy E2, Policy B, and inferred temperature evidence are deliberately absent from this comparison.

## Candidate-pool sufficiency

| Temperature | Eligible Outfits | Distinct current Outfit sources | Distinct corrected Outfit sources | Valid genuine non-innerwear source Items | N3 cards |
| --- | ---: | ---: | ---: | ---: | ---: |
| 26°C | 53 | 29 | 27 | 62 | 3 |
| 28°C | 43 | 24 | 22 | 53 | 3 |
| 33°C | 13 | 13 | 12 | 29 | 3 |

The “valid source Items” count is the distinct pool of genuine source-capable Items contained in eligible Outfits, while “corrected Outfit sources” counts the single newest corrected anchor per Outfit. They answer different questions and are intentionally reported separately.

The 33°C pool is not short of valid sources. The prior three-card repurchase result was caused by historical source-date semantics before the data correction. In the current snapshot, the remaining defect is source eligibility: one final card is anchored by an exact base-layer category that the product does not want to promote as visible novelty.

## 26°C comparison

N0, N1, N2, and N3 select the same three anonymized cards in the same order. All three are anchored by genuine initial acquisition or handmade completion dates. One selected Outfit contains `Top-T-shirts-innerwear`, but its source is a different genuinely new Item. Excluding the base layer does not remove or move the Outfit.

## 28°C comparison

N0, N1, N2, and N3 again select the same three anonymized cards in the same order. No current card disappears after repurchase correction because the production acquisition/Purchase Event records were already corrected before this replay. One selected Outfit contains `Top-T-shirts-innerwear` under a different valid source, and N3 does not change membership.

## 33°C comparison

All four models select the same three anonymized Outfit cards in the same order.

- N0 card 1: genuine visible Item source.
- N0 card 2: exact `Top-T-shirts-innerwear` source dated 2024-06-21.
- N0 card 3: genuine Bag source; the Outfit also contains known-old repurchased Items.
- N1/N2/N3 card 2: human-confirmed Item A initial novelty 2024-06-27 replaces the base layer as source.

N3 therefore changes the explainable source but not the Outfit membership or order. No card is anchored by Item A's 2026 repurchase, by either known-old Item's later repurchase, or by `Top-T-shirts-innerwear`.

The selected Item A Outfit is not present merely because another genuine Item is new: under the authoritative overlay, Item A itself is its N3 novelty source. Other N3 cards do demonstrate the containment rule—known-old repurchased Items and `Top-T-shirts-innerwear` remain inside selected Outfits anchored by different valid Items.

## Incomplete-history behavior

An authoritative known-old override with no confirmed first date receives no invented novelty date. Its Purchase Events remain repurchase history, and it cannot become an N1–N3 new-Item source. Unrelated Items retain current acquisition data; the overlay is not written back and does not generalize from names, Wear Logs, or category substrings.

## Result and next boundary

- Excluding `Top-T-shirts-innerwear` changes no final cards at 26°C, 28°C, or 33°C in the current snapshot.
- It changes the valid source contract and removes one 33°C base-layer anchor.
- 33°C can still return three distinct meaningful source Items; three cards are not forced by the simulator and fewer than three remains valid when the pool is smaller.
- The current post-correction issue is novelty-source semantics, not summer candidate scarcity.

The single recommended next boundary is a disabled N3 integration experiment limited to the Recent Purchase partition: authoritative initial-versus-repurchase evidence, distinct Item-first selection, and exact `Top-T-shirts-innerwear` source exclusion. It must preserve Outfit membership, temperature eligibility, normal/trial groups, warnings, and production feature-off deep equality.
