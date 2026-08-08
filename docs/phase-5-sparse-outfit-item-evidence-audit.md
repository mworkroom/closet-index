# Phase 5 Sparse-Outfit / Item-derived Evidence Audit

## 1. Scope and safety boundary

This audit asks whether the current Recent Purchase temperature gate loses useful Outfits at the transition from zero to one direct Wear Log. It is deliberately isolated from HOME.

- Production access was SELECT-only and batch-loaded Items, Outfits, Outfit Items, Wear Logs, Places, Transports, and Purchase Events.
- No migration, Supabase write, date correction, Wear Log edit, Transport edit, feature-flag change, recommendation wording, or UI change was made.
- N3 is used only as the common novelty-source selection contract after thermal eligibility is calculated. N3 is not connected to HOME.
- Recognizable Outfit, Item, Place, and Transport labels are kept out of this tracked report. Private output is emitted only by the opt-in production audit.

## 2. Current eligibility trace

`recommendOutfits()` builds each Outfit's direct evidence from that Outfit's own Wear Logs. Every `ok` departure or return temperature expands by ±2°C, and the minimum and maximum expanded endpoints become `result.okRange`.

`partitionRecommendations()` admits a Recent Purchase candidate only when all of the following are true:

1. `result.evidence === "observed"`, meaning at least one direct Outfit Wear Log exists;
2. at least one currently eligible Item supplies `latestAcquiredOn`;
3. the current target temperature is inside the direct Outfit range (`rangeDistance === 0`).

A `possible` distance of 1–2°C is rejected. Endpoint, rain, and long-walk warnings remain on the result but do not independently remove Recent Purchase membership. The current comparator then sorts the surviving pool by the latest eligible Item acquisition date and takes three.

The discontinuity is exact:

- With zero direct Wear Logs, an Outfit may receive similar-Outfit and core-Item partial temperature evidence, but it cannot enter Recent Purchase because it is `untried`.
- Similar-Outfit and Item partial evidence are calculated only when the direct Wear Log count is zero.
- As soon as the first direct Wear Log exists, evidence becomes `observed` and the similar/Item partial evidence object becomes `null`.
- One `28°C / ok` endpoint therefore produces only a `26–30°C` direct range. At 33°C it is removed before N3 novelty-source selection begins.

This is an evidence-source switch, not a gradual confidence transition.

## 3. Why the anonymized linen-jacket card survives at 33°C

The audited card has two direct Outfit Wear Logs. Both contain an observed `31°C / ok` departure, so the current ±2°C rule creates a direct `29–33°C` range. The target 33°C is exactly on its upper boundary.

Both range-producing observations came from Car + cinema contexts. There is no direct same-Place + short-walk observation for this Outfit. Because current Recent Purchase membership uses the overall direct Outfit range and does not condition that range on Place or Transport, the Car + cinema evidence is sufficient to retain the card. N3 changes only the novelty source and cannot remove a thermally eligible Outfit.

## 4. The 28°C top-three cards that disappear at 33°C

Three anonymized 28°C cards are absent from the 33°C S0 top three.

| Card | Direct logs | Direct OK range | Direct issue near 33°C | 33°C Item evidence | Similar-Outfit 33°C support | Finding |
| --- | ---: | --- | --- | --- | --- | --- |
| A | 1 | 24–28°C | no | outer and bottom have overall 32–36°C / 33–37°C support, but exact/current-Transport support is absent; base layer does not support 33°C | none | sparse one-log exclusion, but positive evidence is cross-context and internally incomplete |
| B | 1 | 25–29°C | no | top exact range reaches 35°C, but bottom exact range ends at 24°C and overall ends at 32°C | none | one core Item supports; the Outfit as a whole does not |
| C | 4 | 19–28°C | no | top exact range is 31–35°C, but bottom has no exact support and overall ends at 32°C | none | not a 0–1 sparse case; evidence remains split across core Items |

None has a directly observed cold/hot issue within ±2°C of 33°C. Their exclusion is therefore not proof of thermal failure. It is either the one-log source switch (A and B) or the selected 0–1-log model boundary (C), combined with insufficient context-matched evidence across the core outfit.

Inferred return endpoints do not change these primary conclusions. They are retained only as provenance in the audit calculator.

## 5. Scoped Item-derived evidence contract

`calculateScopedItemDerivedEvidence()` derives evidence for thermal-core Items from the Item's appearances in other Outfits. It excludes the target Outfit's own Wear Logs and exposes four non-overlapping/reporting scopes:

- `exactContext`: current Place and current Transport;
- `currentTransport`: the same Transport in other Place contexts, excluding exact-context rows;
- `overall`: all contexts;
- `nullContext`: rows missing Place or Transport, report-only.

Each scope preserves raw OK temperatures, expanded range, cold/hot observations, distinct Wear Log IDs, Outfit IDs, endpoint count, distinct Wear Log count, latest date, inferred-return count, and source Place/Transport IDs. A Wear Log endpoint is deduplicated by `WearLog ID + endpoint`.

Primary ranges exclude inferred return endpoints. Accessories cannot become thermal core evidence. `Top-T-shirts-innerwear` remains part of the Outfit and its evidence is visible, but it cannot be the sole positive support.

The audit mirrors existing weights: outer/bottom/dress 3, top/inner 2, low-thermal accessories 0.25, other 1. Only weight 2 or higher participates as a thermal core Item.

## 6. Sparse eligibility models

- **S0:** current observed direct-Outfit range only.
- **S1:** exactly one direct Wear Log may fall back to exact-context Item evidence when no relevant direct issue exists.
- **S2:** zero or one direct Wear Log; exact context first, and exclusive current-Transport evidence only when exact evidence is absent. Overall remains report-only.
- **S3:** S2 plus overall Item evidence. This is an upper-bound contamination test, not a product candidate.

Direct observed eligibility remains authoritative in every model. A directly relevant cold/hot observation blocks fallback. Mixed evidence is neutral. Outfits with two or more direct logs outside the target range are not recovered by S1–S3 in this audit.

Three aggregation rules were compared rather than collapsed into a score:

- all thermal core Items support;
- at least two thermal core Items support;
- supporting thermal weight is more than half of total core weight.

## 7. Production comparison

The cells below are `eligible Outfit count / recovered versus S0`. For S1–S3, values are shown as `all-core · at-least-two · weighted-majority`.

| Input | S0 | S1 | S2 | S3 |
| --- | ---: | --- | --- | --- |
| 26°C | 53 / 0 | 57/4 · 57/4 · 58/5 | 57/4 · 59/6 · 60/7 | 61/8 · 63/10 · 66/13 |
| 28°C | 43 / 0 | 46/3 · 47/4 · 51/8 | 46/3 · 47/4 · 51/8 | 49/6 · 50/7 · 57/14 |
| 30°C | 30 / 0 | 33/3 · 35/5 · 36/6 | 33/3 · 35/5 · 36/6 | 40/10 · 41/11 · 48/18 |
| 33°C | 13 / 0 | 13/0 · 13/0 · 13/0 | 13/0 · 13/0 · 13/0 | 33/20 · 36/23 · 44/31 |

In this snapshot, every thermally eligible Outfit also had an N3-eligible novelty source. Distinct novelty-source pool counts were:

| Input | S0 | S1 all/≥2/weighted | S2 all/≥2/weighted | S3 all/≥2/weighted |
| --- | ---: | --- | --- | --- |
| 26°C | 64 | 64 / 64 / 64 | 64 / 67 / 67 | 64 / 67 / 69 |
| 28°C | 55 | 55 / 55 / 56 | 55 / 55 / 56 | 55 / 55 / 60 |
| 30°C | 43 | 43 / 43 / 43 | 43 / 43 / 43 | 45 / 45 / 53 |
| 33°C | 31 | 31 / 31 / 31 | 31 / 31 / 31 | 36 / 40 / 46 |

N3 Item-first selection still returns at most three cards, one Outfit ID per selection and one source Item per card. Thermal candidate membership is the variable under test; production HOME arrays are deep-compared before and after the simulation and remain unchanged.

## 8. 33°C finding and context contamination

S1 and S2 recover no 33°C candidate under any aggregation rule. This is the most important result: existing exact-context and current-short-walk Item evidence does not currently support all required core Items of the disputed 28°C cards at 33°C.

S3 recovers 20, 23, or 31 Outfits depending on aggregation. All 33°C recoveries are `overall-items`; none is exact-context or current-Transport. The most permissive rule can recover a zero-wear Outfit when only a high-weight bottom supports 33°C while its top is unknown or clearly cooler. Other recovered candidates borrow broad ranges from Car, cinema, sustained-walk, null, and unrelated Place histories.

Therefore S3 demonstrates context contamination rather than a safe solution. It can surface physically questionable combinations such as a warm top or jacket carried only by a broadly observed bottom Item. It must remain audit-only.

## 9. Recency diagnostic

No cutoff is selected. As of 2026-08-08, the S0 top-three source diagnostics were:

| Input | No expiration | Within 365 days | Within 730 days | Wear buckets among selected sources |
| --- | ---: | ---: | ---: | --- |
| 26°C | 3 | 3 | 3 | three at 1 wear |
| 28°C | 3 | 2 | 3 | one each at 1, 2–4, and 5+ |
| 30°C | 3 | 0 | 3 | three at 5+ |
| 33°C | 3 | 0 | 1 | three at 5+ |

At 33°C, S3 all-core still has 0 cards within 365 days and all three selected sources are within 730 days; weighted-majority instead replaces all three with one-wear sources within 365 days. This volatility is another reason not to combine a recency cutoff with permissive Item fallback yet.

## 10. Data sufficiency and next boundary

Existing Outfit, Item relation, and Wear Log data is sufficient to derive scoped Item evidence without P5C schema or new user input. It is sufficient to prove the current 0→1 discontinuity and to reject overall cross-context fallback as too permissive.

It is not sufficient to show that the disputed 28°C cards are safe 33°C short-walk replacements: the relevant core Items lack consistent exact-context support, and similar-Outfit support is absent. P5C direct Item observations may eventually reduce that uncertainty, but this audit does not establish that new input is required immediately.

The single conservative next disabled boundary is **S2 with all-core aggregation, exact context first, current Transport only when exact evidence is absent, 0–1 direct logs only, and direct issues authoritative**. It should remain a simulator/feature-off comparison until real 33°C short-walk evidence produces a plausible recovery. No model is selected for production.

## 11. Verification coverage

- Ten pure fixtures cover sparse recovery, cross-context rejection, direct issues, zero-wear exploration, two-log neutrality, innerwear/accessory limits, conflict precedence, deduplication, and deterministic input order.
- Production audit uses batch SELECT queries and no candidate-level network requests; there is no query N+1.
- Calculation remains in-memory and can be expensive because candidates traverse shared Outfit/Item/Wear Log arrays. A future integration should pre-index these relations, but this audit does not alter runtime HOME code.
