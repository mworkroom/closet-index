# Phase 5 Recent Purchase Semantics Audit

## Scope and safety

This audit is limited to the meaning and ranking behavior of the existing HOME `recentPurchases` partition. It uses production data through `SELECT` queries only. It does not change HOME behavior, feature flags, Supabase data or schema, migrations, or recommendation wording.

> Correction after user review: this document preserves the pre-correction production snapshot and the legacy Notion data interpretation observed at that time. The application already stores first acquisition in `acquired_on` and repurchases as separate Purchase Events; the earlier result was caused by legacy Notion data that had overwritten acquisition dates, not by a Purchase Event write-path defect. After the production records were corrected, the current replay is documented in `phase-5-recent-purchase-source-eligibility-validation.md`. Human-confirmed initial and repurchase dates supersede the earlier Wear-Log upper-bound inference for the reviewed Item.

The companion implementation in `src/lib/recent-purchase-semantics.ts` is an unconnected, test-only audit and simulation engine. R0–R3 are comparisons, not selected production policies.

## 1. Current behavior (R0)

The current path is:

1. `loadSupabaseAppData()` loads Items, Outfits, Outfit Items, Wear Logs, Places, Transports, and weather locations.
2. Purchase Events are not part of `AppData` and are not loaded into the HOME recommendation snapshot.
3. `recommendOutfits()` builds temperature-eligible `RecommendationResult` values.
4. `partitionRecommendations()` treats an Outfit as a recent purchase candidate when it contains at least one non-excluded Item with `acquiredOn`.
5. The candidate's date is the maximum `acquiredOn` among its eligible Items.
6. Candidates are sorted by that date descending, retain the recommendation comparator as fallback order, and are sliced to three Outfit cards.

The unit is therefore the Outfit, not the acquired Item. One Item can occupy two or three Recent Purchase cards through different Outfits. The current calculation neither deduplicates by Item nor distinguishes first acquisition from replenishment.

## 2. Product intent being audited

The narrow product question is whether Recent Purchase should represent genuine Item novelty rather than the latest replenishment or repurchase date attached to an already-owned Item.

For this audit:

- first acquisition means the first known introduction of an Item into the wardrobe;
- handmade completion may serve as the initial novelty date for a handmade Item;
- later Purchase Events are replenishment evidence and do not create a new Item novelty date;
- an earlier Wear Log can disprove that a later `acquired_on` is the first acquisition, but it cannot recover the exact purchase date;
- missing history remains unknown instead of being filled with a fabricated date.

## 3. Date and write-path map

| Source or operation | Current behavior | Effect on Recent Purchase |
| --- | --- | --- |
| Notion migration | Imports the Acquired Date formula into `closet_items.acquired_on`; the formula may represent purchase or handmade completion | Directly affects R0 |
| Item creation | Writes the submitted `acquiredOn` to `acquired_on` | Directly affects R0 |
| Item editing | Can replace `acquired_on` | Directly affects R0 |
| Purchase Event creation | Inserts an event through the purchase-event RPC and may change current quantity | Does not update `acquired_on` |
| Purchase Event edit/delete | Updates or deletes the event row | Does not update `acquired_on` |
| Replenishment quantity changes | Updates `current_quantity` | Does not update `acquired_on` |
| HOME snapshot load | Does not load Purchase Events | Cannot interpret acquisition provenance |

The database Purchase Event flow itself does not reset novelty. The ambiguity enters through the Item's imported or edited `acquired_on` value, which R0 consumes as if it were always initial acquisition.

## 4. Provenance finding

One anonymized active Item illustrates the problem:

| Evidence | Value |
| --- | --- |
| Current `acquired_on` | 2026-05-14 |
| Notion page creation date | 2026-04-25 |
| Database import/create date | 2026-07-26 |
| Earliest known Wear Log | 2024-06-27 |
| Purchase Event count | 0 |
| Active Outfit count | 11 |

The 2024 Wear Log proves that the 2026 `acquired_on` is not the first wardrobe introduction. The exact original purchase date is not recoverable from current records. For R1/R2 simulation, 2024-06-27 is retained only as an upper bound on ownership, with low confidence and incomplete-history provenance; it is not presented as an exact acquisition date.

## 5. Read-only production candidate counts

The same current Place and Transport were used at 26°C, 28°C, and 33°C. Counts are before the three-card slice.

| Temperature | Eligible Outfits | Distinct current source Items | Genuine-novelty source Items | Repurchase/reset source Items | Extra Outfit slots from repeated source Items |
| --- | ---: | ---: | ---: | ---: | ---: |
| 26°C | 53 | 28 | 22 | 6 | 29 |
| 28°C | 43 | 19 | 16 | 3 | 29 |
| 33°C | 13 | 11 | 8 | 3 | 3 |

“Extra Outfit slots” counts candidate rows beyond the first row for the same current source Item. It measures the structural duplication opportunity in the eligible pool, not necessarily duplication in the final top three.

## 6. R0–R3 simulation

### R0 — current Outfit-first behavior

- Uses each Outfit's maximum eligible `acquired_on`.
- Allows the same source Item to occupy multiple cards.
- At 33°C, all three selected cards were driven by repurchase/reset dates and only two distinct source Items were represented.

### R1 — corrected date, still Outfit-first

- Replaces a disproven reset date with the conservative initial-novelty evidence.
- Keeps Outfit-first selection and therefore can still duplicate source Items.
- At 33°C, it produced three distinct source Items: two genuine-novelty sources and one reset-history source.

### R2 — distinct genuine Item, Item-first

- Selects distinct genuine-novelty Items first, then deterministically chooses one eligible Outfit for each selected Item.
- An Outfit appears at most once and one Item receives at most one card.
- It may return fewer than three cards if fewer than three qualifying distinct genuine Items exist.
- At 33°C, the three cards were anchored by three genuine-novelty Items. An Outfit may still contain a repurchased Item, but that Item cannot be its novelty source.

### R3 — exploratory direct-evidence variants

R3 starts from R2 membership and compares direct exact-context evidence without using inferred return endpoints:

- `baseline-only`: R2 order only;
- `support-preferred`: direct support first; issue, mixed, and unknown remain neutral relative to each other;
- `issue-last`: direct issue last; support, mixed, and unknown remain neutral relative to each other;
- `issue-excluded`: direct issues removed; support preferred while mixed and unknown stay eligible.

Unknown evidence is not negative evidence, and mixed evidence remains neutral. In the audited production scenarios, the selected exact-context outcomes were almost entirely unknown, so R3 variants did not change the R2 top three. The known 33°C evidence from a different Place/Transport context was not borrowed as exact evidence.

## 7. Top-three outcomes by temperature

Labels are intentionally anonymized in the tracked report.

| Temperature | R0 | R1 | R2 | R3 production observation |
| --- | --- | --- | --- | --- |
| 26°C | Three genuine Items; no selected duplicate | Same as R0 | Same as R0 | Same as R2 |
| 28°C | Two genuine Items + one repurchase/reset Item | Three genuine Items | Same selected three as R1 | Same as R2 |
| 33°C | Three repurchase/reset cards from two source Items | Two genuine + one reset-history source | Three genuine source Items | Same as R2 |

At 33°C, one R2 Outfit still visually contains the audited repurchased Item. Its selected novelty source is a different genuine Item in that Outfit. This distinction is essential for explainability.

## 8. Why temperature changes the cards

Context evidence does not decide candidate membership. Existing temperature eligibility first requires the target temperature to fall inside the Outfit's observed comfortable range. The eligible pool shrinks from 53 Outfits at 26°C to 43 at 28°C and 13 at 33°C.

R0 then sorts the remaining Outfits by the latest eligible Item date. At 33°C, broad hot-weather Outfits containing recently repurchased Items survive the temperature filter and dominate the three Outfit slots. This is a date-semantics and selection-unit effect, not an exact-context-evidence promotion.

## 9. Incomplete history and recoverability

The current structures can safely detect some false-first-acquisition cases when a Wear Log predates `acquired_on`. They cannot recover an exact original acquisition date when that date was overwritten or never imported.

Neither `created_at` nor `notion_created_at` is a safe replacement:

- database `created_at` can be the migration/import timestamp;
- Notion creation can occur after ownership began;
- a Purchase Event represents replenishment and cannot be reinterpreted as initial acquisition;
- the first Wear Log is only proof of ownership by that date, not proof of purchase on that date.

## 10. Query and integration boundary

The production audit batch-loads Items, Outfit links, Wear Logs, and Purchase Events. A future production implementation must preserve batch loading. It can use the existing multi-Item Purchase repository path or add Purchase Events explicitly to an application snapshot; it must not query Purchase Events once per Item.

No additional schema is required for a conservative R2-style correction that excludes dates disproved by earlier Wear Logs and treats uncertain history as unknown. Existing structures are insufficient only if the product requires an exact historical first-acquisition date that is not currently recorded.

## 11. Smallest recommended next boundary

If work continues, the single narrow next step is a disabled R2 Item-first integration experiment:

- leave HOME UI and wording unchanged;
- preserve temperature eligibility and all existing recommendation groups;
- select at most one card per genuine Item;
- allow fewer than three Recent Purchase cards;
- expose source Item and novelty provenance only to tests/audit output;
- keep ambiguous or unrecoverable acquisition history out of novelty ranking rather than inventing a date.

This audit does not select or enable that policy.
