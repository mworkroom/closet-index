# Phase 5 Context-conditioned Recent Purchase Eligibility Audit

## 1. Scope and safety boundary

This audit tests whether Place and Transport should constrain Recent Purchase membership. It is deliberately isolated from HOME.

- Production access was SELECT-only and batch-loaded Items, Outfits, Outfit Items, Wear Logs, Places, Transports, and Purchase Events.
- No Supabase data or schema, migration, HOME UI, wording, recommendation behavior, or feature flag was changed.
- N3 is used only as the common novelty-source contract after context eligibility is calculated. It is not connected to HOME.
- Sparse Item-evidence expansion is stopped. S1, S2, and S3 are not reused here.
- Recognizable Outfit, Item, Place, and Transport labels are excluded from this tracked report. The opt-in production audit emits them only in private local output.

## 2. Confirmed mismatch in the current HOME contract

`recommendOutfits()` creates an Outfit-level overall temperature range from all directly observed OK endpoints, expanded by ±2°C. `partitionRecommendations()` then admits an observed Outfit to Recent Purchase when the target temperature is inside that overall range and an eligible Item supplies the latest acquisition date.

Place and Transport are present in the HOME input and Wear Logs, but they do not participate in this membership gate. Consequently, a range created only by Car + cinema observations can admit a card for a nearby-place + short-walk input. Rain, long-walk, endpoint warnings, reasons, and the existing comparator remain untouched by this audit.

## 3. Pure context eligibility contract

`calculateOutfitContextEligibility()` evaluates direct Outfit Wear Logs only and returns one mutually exclusive state:

| State | Meaning |
| --- | --- |
| `exact_support` | Same non-null Place and Transport has at least one relevant OK endpoint and no relevant cold/hot endpoint. |
| `exact_issue` | Same Place and Transport has a relevant cold/hot endpoint and no relevant OK endpoint. |
| `exact_mixed` | Same Place and Transport has both relevant OK and cold/hot endpoints. |
| `current_transport_support` | Exact support is absent, but the same non-null Transport in another Place has relevant OK evidence. |
| `cross_context_only` | Relevant overall OK support exists, but all of it is outside the selected Place and/or Transport. |
| `untried` | The Outfit has no direct Wear Log. |
| `unknown` | Direct logs exist, but they do not establish relevant support or an exact issue for the selected context. |

Relevance is evaluated per corresponding departure/return endpoint within ±2°C. Historical null Transport never matches a selected Transport. Current Place null disables exact context, and current Transport null disables all context-conditioned eligibility. Inferred return endpoints are retained in audit provenance but excluded from ranges, outcomes, and eligibility states.

Each scope preserves distinct Wear Log IDs and counts, source Place/Transport IDs, worn dates, endpoint temperatures, feelings, inferred-return markers, and the overall, exact-context, and exclusive current-Transport ranges. Duplicate Wear Log rows and input ordering cannot change the result.

## 4. N3 source contract used by every model

Every model applies the same source-selection layer after thermal/context eligibility:

- initial acquisition or handmade completion supplies novelty;
- repurchase does not reset novelty;
- exact category `Top-T-shirts-innerwear` cannot be the novelty source but remains in the Outfit;
- selection is distinct Item-first, one card per source Item, and one appearance per Outfit;
- deterministic date/ID/baseline tie-breaking is retained;
- fewer than three cards is valid.

## 5. Models compared

- **C0:** current observed overall Outfit membership gate, followed by the common N3 source-selection layer.
- **C1:** `exact_support` only.
- **C2:** exact first, then `current_transport_support`.
- **C3 report-only:** exact first, then genuinely sourced `untried` or issue-free `unknown`; current-Transport support is reported but not admitted.
- **C3 transport-eligible:** exact, then current Transport, then exploration.
- **C4:** C3 plus `cross_context_only` as the last diagnostic tier. C4 is not a product candidate.

`exact_issue` and `exact_mixed` are ineligible in every context-conditioned model. Absence of evidence is never converted into a negative observation.

## 6. SELECT-only production comparison

Cells are `eligible Outfit count / distinct N3 source Item count / returned card count`. Labels are anonymized; the private audit output retains recognizable labels and full evidence.

| Nearby-place + short-walk input | C0 | C1 | C2 | C3 report-only | C3 transport-eligible | C4 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 26°C | 53 / 64 / 3 | 5 / 10 / 3 | 7 / 16 / 3 | 199 / 226 / 3 | 201 / 228 / 3 | 240 / 238 / 3 |
| 28°C | 43 / 55 / 3 | 6 / 11 / 3 | 6 / 11 / 3 | 209 / 231 / 3 | 209 / 231 / 3 | 241 / 239 / 3 |
| 30°C | 30 / 43 / 3 | 1 / 4 / **1** | 1 / 4 / **1** | 218 / 236 / 3 | 218 / 236 / 3 | 243 / 239 / 3 |
| 33°C | 13 / 31 / 3 | 1 / 4 / **1** | 1 / 4 / **1** | 235 / 239 / 3 | 235 / 239 / 3 | 245 / 239 / 3 |

The selected state pattern explains the count difference:

| Temperature | C0 top-card states | C1/C2 top-card states | C3/C4 selected states |
| --- | --- | --- | --- |
| 26°C | cross-context ×3 | exact ×3 | exact ×3 |
| 28°C | cross-context ×3 | exact ×3 | exact ×3 |
| 30°C | cross-context ×3 | exact ×1 | exact ×1, unknown exploration ×2 |
| 33°C | exact ×1, cross-context ×2 | exact ×1 | exact ×1, unknown exploration ×2 |

The C0 simulation retains the same three-card set as current HOME in all four inputs. At 30°C, however, N3 Item-first source ordering swaps the second and third cards. This is an expected simulator distinction: C0 freezes the current thermal membership gate, while the mandated common N3 layer changes source semantics and ordering. The production HOME arrays themselves remain unchanged.

C3's eligible pool expands to 199–235 Outfits because the current N3 source contract distinguishes valid initial novelty provenance but has no recency cutoff of its own. C3 fills three cards, but the two exploration cards at 30°C and 33°C are not verified context support. This audit must not silently present them as such.

The context-state distributions across 247 recommendation results were:

| Temperature | exact support | exact issue | exact mixed | Transport support | cross-context | untried | unknown |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 26°C | 5 | 3 | 0 | 2 | 39 | 4 | 194 |
| 28°C | 6 | 3 | 0 | 0 | 32 | 4 | 202 |
| 30°C | 1 | 2 | 0 | 0 | 25 | 4 | 215 |
| 33°C | 1 | 0 | 0 | 0 | 10 | 4 | 232 |

## 7. Disputed outerwear card

At 33°C nearby-place + short walk, anonymized Outfit L has two direct logs and an overall 29–33°C OK range. Both relevant 31°C departures came from Car + cinema contexts. It therefore becomes `cross_context_only`:

- C0: eligible and selected;
- C1, C2, and both C3 variants: ineligible and absent;
- C4: eligible only in the last diagnostic tier, but not selected because higher tiers already fill three cards.

At 33°C cinema + Car, one observation is exact-context support and the other is exclusive same-Transport support. Outfit L becomes `exact_support` and is eligible and selected in every model. Inferred return endpoints are visible in provenance but did not create either result.

This distinguishes candidate eligibility from final three-card selection: C4 restores Outfit L to its permissive pool, but does not guarantee it a card.

## 8. The three 28°C cards when replayed at 33°C

All three become `unknown`, not supported or failed:

| Card | Exact range | current-Transport range | overall range | 33°C model behavior |
| --- | --- | --- | --- | --- |
| A | none | none | 24–28°C | C0/C1/C2 ineligible; C3/C4 exploration-eligible but not selected |
| B | none | none | 25–29°C | C0/C1/C2 ineligible; C3/C4 exploration-eligible but not selected |
| C | 20–24°C | 19–23°C | 19–28°C | C0/C1/C2 ineligible; C3/C4 exploration-eligible but not selected |

Their inferred return observations are report-only. No card has a relevant 33°C exact support, current-Transport support, direct issue, or mixed outcome. C1 and C2 correctly return one card rather than forcing any of these three back into the section.

## 9. 33°C cinema + Car comparison

Across all 247 results, cinema + Car has 3 `exact_support`, 7 `current_transport_support`, 1 `cross_context_only`, 4 `untried`, and 232 `unknown`. C1 returns three exact cards. C2 admits ten eligible Outfits but still selects the same three exact cards because exact evidence ranks first. Both C3 variants and C4 also select exact cards first.

## 10. Normal recommendation diagnostic

Normal recommendations were not removed or reordered.

| 33°C context | Normal count | exact support | Transport support | cross-context | unknown | Current top-six finding |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| nearby-place + short walk | 240 | 0 | 0 | 8 | 232 | all six current top cards are cross-context-only and would lose verified status |
| cinema + Car | 240 | 2 | 5 | 1 | 232 | two top-six cards remain exact-verified; three have lower-confidence Transport support; one is cross-context-only |

This is diagnostic only. It does not establish a removal or ranking policy for the normal section.

## 11. Missing-context fallbacks

At 33°C with either Place or Transport missing:

- **Fallback A (`current-c0`):** retains the existing pool of 13 eligible Outfits and returns the same three cards. It does not invent exact support.
- **Fallback B (`disabled`):** returns zero eligible Outfits and zero cards.

With Place null, exact context is disabled but the calculator can still report same-Transport evidence. With Transport null, exact and Transport scopes are disabled and all tried Outfits are `unknown`. This audit does not select a production fallback.

## 12. Recommended next disabled integration boundary

The single safest next boundary is a **Recent Purchase-only, default-off C1 experiment**: when both Place and Transport are present, admit only `exact_support`, apply the N3 source contract afterward, and allow fewer than three cards. Keep the missing-context choice outside the experiment until Fallback A versus B is decided.

Do not integrate C3 yet. Its current exploration definition fills sparse slots from a very large `unknown` pool and therefore needs a separately approved recency/exploration contract before it can be interpreted as “genuinely new.” Do not integrate C4; it reproduces the cross-context contamination this audit was created to expose.

The next integration, if approved, must preserve feature-off deep equality for the full HOME partition and must not alter reasons, warnings, normal recommendations, UI wording, or production defaults.
