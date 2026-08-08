# Phase 5 Normal-recommendation Context Eligibility Comparison

## Scope

This is a read-only, disconnected comparison of normal-recommendation eligibility. It does not modify HOME, W2 Recent Purchase, `longWalkCondition`, feature flags, Supabase data, schema, or migrations.

The local flag preflight found exactly this Phase 5 state:

- `VITE_P5A_RECENT_PURCHASE_W2=true`
- `VITE_P5A_RECENT_PURCHASE_C1_N3=false`
- `VITE_P5A_DIRECT_EVIDENCE_E2=false`
- `VITE_P5A_TRANSPORT_POLICY_B=false`

The simulator receives W2's existing normal-recommendation array as its immutable baseline. N0 returns the same objects in the same order. N1 and N2 are projections only and are not called by HOME.

## Models

- **N0:** current overall Outfit OK range across all Places and Transports.
- **N1:** `exact_support`, then `current_transport_support`; all other states are excluded from the verified projection.
- **N2:** `exact_support`, then `current_transport_support`, then explicit `cross_context_only` and `unknown` fallback tiers. Fallback is never represented as verified support.

Inside a tier, the comparator preserves recommendation level, temperature distance, baseline rank, and Outfit ID as the final deterministic tie-break. Existing `RecommendationResult` objects, reasons, warnings, and temperature ranges are reused without recalculation.

## Production SELECT-only snapshot

Recognizable labels remain only in private command output. Place and Outfit names below are anonymized.

| Input | N0 normal cards | N1 verified | N2 fallback available | Fallback needed in N2 top 6 |
| --- | ---: | ---: | ---: | ---: |
| 30°C · nearby place A · short walk | 240 | 1 | 237 | 5 |
| 33°C · nearby place A · short walk | 240 | 1 | 239 | 5 |
| 28°C · nearby place A · short walk | 238 | 6 | 229 | 0 |
| 30°C · sustained-walk place B · sustained walk | 240 | 0 | 240 | 6 |
| 33°C · cinema C · Car | 240 | 9 | 231 | 0 |

N2 moves the directly supported nearby-place Outfit ahead of the current Car-only leader at all three nearby inputs:

| Input | Verified movement | Highest Car-only fallback movement |
| --- | --- | --- |
| 30°C nearby short walk | baseline 20 → N2 1 | baseline 1 → N2 2 |
| 33°C nearby short walk | baseline 3 → N2 1 | baseline 1 → N2 2 |
| 28°C nearby short walk | baseline 2 → N2 1; five more exact cards fill ranks 2–6 | baseline 1 → N2 7 |

At cinema C + Car, exact same-Place-and-Transport cards at baseline ranks 4, 5, and 7 become N2 ranks 1, 2, and 3. Same-Transport support from other Places moves behind them to ranks 4–6. This demonstrates the intended distinction between exact and borrowed Transport evidence.

The three nearby inputs contained 26, 21, and 8 cross-context candidates whose relevant support came only from Car. They contained zero candidates whose relevant support came only from sustained walk. The tested sustained-walk input also had zero exact or current-Transport verified cards, so N1 was empty and N2 necessarily used six fallback cards. The current snapshot therefore confirms Car contamination in this matrix but does not provide a sustained-only top-six movement example.

## Endpoint and warning findings

The baseline leaders' overall ranges are commonly defined by observations from other Places and Transports. Raw endpoint sources are retained in the private report with Place, Transport, Wear Log ID, endpoint, and inferred-return provenance.

The overall baseline range may include an inferred return endpoint under existing recommendation behavior. Context support itself continues to ignore inferred return evidence. No reason, warning, level, range, or temperature distance is altered by the simulator.

At 28°C, the sixth exact-supported N2 card is an existing `caution` result with hot warnings, even though multiple fallback cards are `high`. This follows the requested context-tier-first N2 definition while preserving level only inside each tier. It is a material safety/product boundary that must be resolved before any HOME integration.

N2 also excludes exact issue and exact mixed states rather than silently treating them as fallback. In this snapshot that creates 3 projection exclusions at 28°C and 2 at 30°C nearby; the other tested inputs create none. Because the simulator is disconnected, actual HOME candidate loss remains zero.

## Independence and regression boundary

- W2 Recent Purchase output is unchanged.
- HOME normal-recommendation output is unchanged.
- Toggling `longWalkCondition` changes neither context state nor N1/N2 tier. It remains an independent shoe-suitability input.
- Place and Transport remain the only context keys used by this simulator.
- N0 preserves baseline membership, order, deep equality, and object identity even when the supplied baseline order differs from the standard comparator.
- No feature flag or HOME control calls N1 or N2.

## Recommended disabled boundary

Keep **N2 as the single disabled comparison boundary**, not as an activation candidate yet. It best matches the product intent because it places exact support above same-Transport support and makes cross-context/unknown evidence an explicit fallback without emptying HOME.

Before a future integration, define a safety partition that prevents a context tier from lifting `caution` above `high` or `possible`, and decide where exact issue/mixed cards remain visible. Until those two contracts are explicit, keep N2 disconnected from HOME and leave W2 unchanged.
