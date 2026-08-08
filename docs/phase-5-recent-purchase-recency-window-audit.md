# Phase 5 Recent Purchase Recency-window Audit

## 1. Scope and safety boundary

This audit explores an absolute novelty expiration rule without connecting a new policy to HOME.

- Production access was SELECT-only.
- HOME recommendation arrays, partitioning, UI, wording, and feature flags were not changed.
- Supabase data, schema, migrations, Item dates, Purchase Events, Wear Logs, and Transport taxonomy were not changed.
- W0 through W3 are pure simulations. Recognizable labels appear only in private local output.
- The audit snapshot date is 2026-08-08 KST.

## 2. Product purpose and the C1 mismatch

Recent Purchase is an exploration surface: it should encourage wearing genuinely new Items when the Outfit already has enough direct evidence to estimate its overall temperature suitability. Exact Place + Transport success is useful confidence, but is not a prerequisite for this purpose.

Strict C1 changed that meaning. At 26°C and 28°C it removed every current feature-off card because all were `cross_context_only`, even though the source Items were 36 to 67 days old and the target was inside each Outfit's observed overall range. It then selected exact-context cards whose novelty sources were 432 days old or older. Those replacements were not newer; they were selected only because exact-context support outranked recency without an absolute cutoff. C1 therefore behaved like exact-context verification rather than recent exploration.

## 3. Preserved base contracts

W1, W2, and W3 reuse N3 source semantics:

- initial acquisition or handmade completion supplies novelty;
- Purchase Events and replenishment do not reset novelty;
- exact `Top-T-shirts-innerwear` cannot be a source, while another valid Item in the same Outfit can be;
- selection is distinct Item-first;
- one source Item receives at most one card and one Outfit appears at most once;
- at most three cards are returned, and zero to three is valid;
- observed Outfit membership, overall range containment, season, archived, retired, rating, rain, and long-walk filters remain the existing baseline;
- duplicate rows and input ordering cannot change results;
- inferred return endpoints remain provenance-only and cannot create support or issue.

No non-selected observed Outfit is lost. It remains in normal recommendations in its existing baseline order.

## 4. Compared models

| Model | Novelty window | Context eligibility | Ranking |
| --- | ---: | --- | --- |
| W0 | none | current feature-off observed + overall range | current source behavior |
| W1 | 180 days | exact support, Transport support, cross-context/unknown exploration; exact issue/mixed excluded | context tier, novelty date, baseline rank, IDs |
| W2 | 365 days | same as W1 | same as W1 |
| W3 | 365 days | exact support only | novelty date, baseline rank, IDs |

W1 and W2 do not treat absence of exact support as failure. Every admitted source must first be within the selected novelty window; expired sources never fill an empty slot.

## 5. SELECT-only production card counts

The nearby-place and cinema names are anonymized in this tracked report.

| Input | W0 | W1 | W2 | W3 | W1/W2 selected composition |
| --- | ---: | ---: | ---: | ---: | --- |
| nearby A · short walk · 26°C | 3 | 3 | 3 | 0 | exact 0, exploration 3 |
| nearby A · short walk · 28°C | 3 | 2 | 2 | 0 | exact 0, exploration 2 |
| nearby A · short walk · 30°C | 3 | 0 | 0 | 0 | none |
| nearby A · short walk · 33°C | 3 | 0 | 0 | 0 | none |
| cinema A · Car · 33°C | 3 | 0 | 0 | 0 | none |
| Place null · short walk · 33°C | 3 | 0 | 0 | 0 | none |
| nearby A · Transport null · 33°C | 3 | 0 | 0 | 0 | none |

At 26°C, W1 and W2 restore all three preferred W0 cards with source ages 36, 47, and 50 days. At 28°C they restore the two genuinely recent W0 cards with source ages 50 and 67 days; the third W0 source is 403 days old and expires. No old exact-support C1 replacement enters W1 or W2.

At 30°C and 33°C, all thermally eligible potential sources are older than 365 days, so W1 and W2 correctly return zero rather than filling three cards. At cinema A + Car, an old outerwear Outfit has exact support, but its source is outside both windows. It remains an observed normal recommendation and cannot enter Recent Purchase.

## 6. Cutoff diagnostics

Counts below are distinct N3-capable source Items among the observed overall-temperature candidates for that input. The 90-day column is diagnostic only.

| Input | ≤90 days | ≤180 days | ≤365 days | >365 days | hidden expired exact-support sources |
| --- | ---: | ---: | ---: | ---: | ---: |
| 26°C nearby short | 6 | 6 | 6 | 58 | 10 |
| 28°C nearby short | 2 | 2 | 2 | 53 | 11 |
| 30°C nearby short | 0 | 0 | 0 | 43 | 4 |
| 33°C nearby short | 0 | 0 | 0 | 31 | 4 |
| 33°C cinema Car | 0 | 0 | 0 | 31 | 11 |

In this snapshot, W1 and W2 have identical selected cards and eligible-source counts. Production data therefore does not distinguish the 180-day and 365-day cutoffs today. The 250-day fixture proves the intended difference: W1 expires it and W2 retains it.

## 7. Expiration effects on current W0 cards

| Input | W0 cards past 180 days | W0 cards past 365 days |
| --- | ---: | ---: |
| 26°C nearby short | 0 | 0 |
| 28°C nearby short | 1 | 1 |
| 30°C nearby short | 3 | 3 |
| 33°C nearby short | 3 | 3 |
| 33°C cinema Car | 3 | 3 |

The audited exact-supported old outerwear source is 778 days old in the 33°C scenarios. Another exact-supported current W0 source is 403 days old. Both windows remove them from Recent Purchase without removing the Outfits from normal recommendations.

## 8. Zero-to-three behavior and preservation

Production produced three-card, two-card, and zero-card outcomes. One-card behavior is fixed by a dedicated fixture. No scenario used an expired source to fill a vacancy.

For every W1/W2/W3 scenario:

- selected source IDs were distinct;
- selected Outfit IDs were distinct;
- selected plus normal observed membership equaled the original observed membership;
- candidate loss was zero;
- inferred return ranking effect was zero.

The 15 fixtures also cover 90-, 250-, and 400-day boundaries, exact issue/mixed exclusion, duplicate sources, innerwear-only sources, repurchase, missing context, deep feature-off equality, and duplicate-row/input-order determinism.

## 9. Seasonal implications

A 180-day window matches the currently preferred two-month-old examples and creates the narrower meaning of “recent.” Its cost is that an Item acquired late in one season can expire before the next comparable season, leaving no chance for a once-per-year temperature context.

A 365-day window allows an Item to reach the next matching season and is more forgiving for low-wear seasonal purchases. Its cost is that an Item can remain eligible for almost a full year, which may no longer feel new. The current snapshot contains no thermally eligible source between 181 and 365 days in the tested matrix, so recognizable production results cannot resolve this tradeoff.

## 10. Missing-input comparison

- **M-A:** apply the recency window and existing overall-temperature eligibility, with no exact-context tier.
- **M-B:** hide Recent Purchase when Place or Transport is missing.

At the tested 33°C production inputs, both yield zero because every potential source is already older than 365 days. The distinction is still contract-tested: with a valid recent source, M-A returns the bounded exploration card and M-B returns none. No permanent missing-input policy is selected by this audit.

## 11. Recommended next disabled boundary

For a next local-only experiment, use **W1 (N3 + 180 days) with M-A** behind a new default-off, production-forced-false boundary. This is a testing recommendation, not a selected production policy: it restores the 36–67-day exploration cards, prevents old exact-context evidence from redefining “recent,” and keeps missing context from becoming an unrelated hard failure.

Keep W2 as the seasonal control. Before any HOME integration or activation, J should review whether a 181–365-day seasonal example still feels new enough. C1 remains a strict comparison model and is no longer the selected product direction.
