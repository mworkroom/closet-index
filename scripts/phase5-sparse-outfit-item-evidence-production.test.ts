import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  applyAuthoritativeNoveltyOverrides,
  deriveInitialNoveltyDate,
  type AuthoritativeNoveltyOverride,
  type InitialNoveltyEvidence,
} from '../src/lib/recent-purchase-semantics'
import {
  buildSparseEligibilityCandidates,
  simulateSparseRecentPurchaseEligibility,
  type ItemAggregationRule,
  type ItemDerivedScopeName,
  type SparseEligibilityCandidate,
  type SparseEligibilitySimulation,
} from '../src/lib/sparse-outfit-item-evidence'
import {
  partitionRecommendations,
  recommendOutfits,
} from '../src/lib/recommendation'
import type {
  AppData,
  Item,
  Outfit,
  PurchaseEvent,
  RecommendationInput,
  WearLog,
} from '../src/lib/types'

const RUN_PRODUCTION_AUDIT =
  process.env.RUN_PHASE5_SPARSE_ITEM_EVIDENCE_PRODUCTION === 'true'
const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'
const AUDIT_AS_OF = '2026-08-08'
const RULES: ItemAggregationRule[] = [
  'all-core',
  'at-least-two',
  'weighted-majority',
]
const SCOPES: ItemDerivedScopeName[] = [
  'exactContext',
  'currentTransport',
  'overall',
  'nullContext',
]

function invariant<T>(value: T, message: string): NonNullable<T> {
  if (value === null || value === undefined || value === '') {
    throw new Error(message)
  }
  return value as NonNullable<T>
}

function daysBetween(left: string, right: string) {
  return Math.floor(
    (Date.parse(`${right}T00:00:00Z`) - Date.parse(`${left}T00:00:00Z`)) /
      86_400_000,
  )
}

describe.runIf(RUN_PRODUCTION_AUDIT)(
  'read-only production sparse-Outfit Item-evidence audit',
  () => {
    it('compares S0-S3 without mutating HOME recommendations', async () => {
      const envFile = resolve('.env.supabase.local')
      if (existsSync(envFile)) process.loadEnvFile(envFile)
      const supabaseUrl = invariant(
        process.env.SUPABASE_URL,
        'SUPABASE_URL is required',
      ).replace(/\/$/, '')
      expect(new URL(supabaseUrl).hostname).toBe(
        `${EXPECTED_PROJECT_REF}.supabase.co`,
      )
      const secretKey = invariant(
        process.env.SUPABASE_SECRET_KEY ??
          process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Supabase read key is required',
      )
      const workspaceId = invariant(
        process.env.IMPORT_WORKSPACE_ID,
        'IMPORT_WORKSPACE_ID is required',
      )
      const client = createClient(supabaseUrl, secretKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })

      async function collectAll(table: string, columns: string) {
        const rows: Record<string, unknown>[] = []
        const pageSize = 1000
        for (let from = 0; ; from += pageSize) {
          const result = await client
            .from(table)
            .select(columns)
            .eq('workspace_id', workspaceId)
            .range(from, from + pageSize - 1)
          if (result.error) throw result.error
          rows.push(...((result.data ?? []) as Record<string, unknown>[]))
          if ((result.data?.length ?? 0) < pageSize) return rows
        }
      }

      const [
        itemRows,
        outfitRows,
        outfitItemRows,
        wearLogRows,
        placeRows,
        transportRows,
        purchaseEventRows,
      ] = await Promise.all([
        collectAll(
          'closet_items',
          'id,name,category,semantic_color,seasons,retired,rain_ok,long_walk_ok,memo,acquired_on,current_quantity',
        ),
        collectAll('closet_outfits', 'id,display_name,rating,archived_at'),
        collectAll('closet_outfit_items', 'outfit_id,item_id,sort_order'),
        collectAll(
          'closet_wear_logs',
          'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,memo,temperature_source,weather_location_id,weather_issued_at,weather_overridden,submission_token,created_at',
        ),
        collectAll('closet_places', 'id,name'),
        collectAll('closet_transport_modes', 'id,name'),
        collectAll(
          'closet_purchase_events',
          'id,item_id,purchased_on,quantity,created_at,updated_at',
        ),
      ])

      const items: Item[] = itemRows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        category: row.category as string,
        semanticColor: (row.semantic_color as string | null) ?? null,
        displayHex: '#B8B8B4',
        seasons: (row.seasons as string[] | null) ?? [],
        retired: Boolean(row.retired),
        rainOk: Boolean(row.rain_ok),
        longWalkOk: Boolean(row.long_walk_ok),
        memo: (row.memo as string | null) ?? null,
        acquiredOn: (row.acquired_on as string | null) ?? null,
        currentQuantity: (row.current_quantity as number | null) ?? null,
      }))
      const itemById = new Map(items.map((item) => [item.id, item]))
      const linksByOutfit = new Map<
        string,
        Array<{ itemId: string; sortOrder: number }>
      >()
      for (const row of outfitItemRows) {
        const outfitId = row.outfit_id as string
        const links = linksByOutfit.get(outfitId) ?? []
        links.push({
          itemId: row.item_id as string,
          sortOrder: row.sort_order as number,
        })
        linksByOutfit.set(outfitId, links)
      }
      const outfits: Outfit[] = outfitRows.map((row) => ({
        id: row.id as string,
        displayName: (row.display_name as string | null) ?? null,
        rating: row.rating as Outfit['rating'],
        archivedAt: (row.archived_at as string | null) ?? null,
        itemIds: (linksByOutfit.get(row.id as string) ?? [])
          .sort(
            (left, right) =>
              left.sortOrder - right.sortOrder ||
              left.itemId.localeCompare(right.itemId),
          )
          .map((link) => link.itemId),
      }))
      const wearLogs: WearLog[] = wearLogRows.map((row) => ({
        id: row.id as string,
        outfitId: row.outfit_id as string,
        wornOn: row.worn_on as string,
        tempOut: (row.temp_out as number | null) ?? null,
        tempBack: (row.temp_back as number | null) ?? null,
        tempBackInferred: Boolean(row.temp_back_inferred),
        feelingOut: row.feeling_out as WearLog['feelingOut'],
        feelingBack: row.feeling_back as WearLog['feelingBack'],
        rainCondition: row.rain_condition as WearLog['rainCondition'],
        longWalkCondition:
          row.long_walk_condition as WearLog['longWalkCondition'],
        placeId: (row.place_id as string | null) ?? null,
        transportModeId: (row.transport_mode_id as string | null) ?? null,
        memo: (row.memo as string | null) ?? null,
        temperatureSource:
          row.temperature_source as WearLog['temperatureSource'],
        weatherLocationId:
          (row.weather_location_id as string | null) ?? null,
        weatherIssuedAt: (row.weather_issued_at as string | null) ?? null,
        weatherOverridden: Boolean(row.weather_overridden),
        submissionToken: (row.submission_token as string | null) ?? '',
        createdAt: row.created_at as string,
      }))
      const places = placeRows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
      }))
      const transportModes = transportRows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
      }))
      const purchaseEvents: PurchaseEvent[] = purchaseEventRows.map((row) => ({
        id: row.id as string,
        itemId: row.item_id as string,
        purchasedOn: row.purchased_on as string,
        quantity: row.quantity as number,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      }))
      const data: AppData = { items, outfits, wearLogs, places, transportModes }
      const placeById = new Map(places.map((place) => [place.id, place.name]))
      const transportById = new Map(
        transportModes.map((transport) => [transport.id, transport.name]),
      )
      const outfitById = new Map(outfits.map((outfit) => [outfit.id, outfit]))
      const eventsByItemId = new Map<string, PurchaseEvent[]>()
      for (const event of purchaseEvents) {
        const events = eventsByItemId.get(event.itemId) ?? []
        events.push(event)
        eventsByItemId.set(event.itemId, events)
      }
      const logsByOutfitId = new Map<string, WearLog[]>()
      for (const log of wearLogs) {
        const logs = logsByOutfitId.get(log.outfitId) ?? []
        logs.push(log)
        logsByOutfitId.set(log.outfitId, logs)
      }
      const outfitLabel = (outfit: Outfit) =>
        outfit.displayName?.trim() ||
        outfit.itemIds
          .map((itemId) => itemById.get(itemId)?.name)
          .filter(Boolean)
          .join(' + ') ||
        'Unnamed Outfit'

      const baselineNoveltyByItemId = new Map<string, InitialNoveltyEvidence>(
        items.map((item) => [
          item.id,
          deriveInitialNoveltyDate({
            item,
            purchaseEvents: eventsByItemId.get(item.id) ?? [],
            earliestKnownWearOn: null,
            notionCreatedAt: null,
            databaseCreatedAt: null,
          }),
        ]),
      )
      const overrides: AuthoritativeNoveltyOverride[] = items
        .filter(
          (item) =>
            !item.retired &&
            item.category.trim().toLocaleLowerCase('en-US') ===
              'top-t-shirts-innerwear',
        )
        .map((item) => ({
          itemId: item.id,
          noveltySourceEligible: false,
          reason: 'exact Top-T-shirts-innerwear source exclusion',
        }))
      const noveltyOverlay = applyAuthoritativeNoveltyOverrides(
        baselineNoveltyByItemId,
        overrides,
      )

      const shortTransport = invariant(
        transportModes.find((transport) =>
          /short|near|근거리/iu.test(transport.name),
        ),
        'short-walk Transport missing',
      )
      const nearbyPlace = invariant(
        places
          .map((place) => ({
            place,
            count: wearLogs.filter(
              (log) =>
                log.placeId === place.id &&
                log.transportModeId === shortTransport.id,
            ).length,
          }))
          .filter((entry) => entry.count > 0)
          .sort(
            (left, right) =>
              Number(/\bto$/iu.test(right.place.name)) -
                Number(/\bto$/iu.test(left.place.name)) ||
              right.count - left.count ||
              left.place.id.localeCompare(right.place.id),
          )[0]?.place,
        'nearby Place with short-walk evidence missing',
      )

      const itemWearLogIds = new Map<string, Set<string>>()
      for (const outfit of outfits) {
        const logIds = (logsByOutfitId.get(outfit.id) ?? []).map((log) => log.id)
        for (const itemId of outfit.itemIds) {
          const existing = itemWearLogIds.get(itemId) ?? new Set<string>()
          logIds.forEach((logId) => existing.add(logId))
          itemWearLogIds.set(itemId, existing)
        }
      }
      const inputFor = (temperature: number): RecommendationInput => ({
        tempOut: temperature,
        tempBack: null,
        rainCondition: 'no',
        longWalkCondition: 'no',
        placeId: nearbyPlace.id,
        transportModeId: shortTransport.id,
      })

      function sourceDiagnostics(sourceItemId: string, noveltyDate: string) {
        const item = invariant(itemById.get(sourceItemId), 'source Item missing')
        const wearLogIds = itemWearLogIds.get(sourceItemId) ?? new Set<string>()
        const wearSinceAcquisition = wearLogs.filter(
          (log) =>
            wearLogIds.has(log.id) &&
            (!noveltyDate || log.wornOn >= noveltyDate),
        ).length
        const ageDays = daysBetween(noveltyDate, AUDIT_AS_OF)
        return {
          sourceItem: item.name,
          sourceCategory: item.category,
          acquisitionDate: noveltyDate,
          ageDays,
          totalItemWearCount: wearLogIds.size,
          wearCountSinceAcquisition: wearSinceAcquisition,
          within365Days: ageDays <= 365,
          within730Days: ageDays <= 730,
          wearBucket:
            wearLogIds.size === 0
              ? '0'
              : wearLogIds.size === 1
                ? '1'
                : wearLogIds.size < 5
                  ? '2-4'
                  : '5+',
        }
      }

      function directObservations(candidate: SparseEligibilityCandidate) {
        return candidate.direct.observations.map((observation) => ({
          wearLogId: observation.wearLogId,
          wornOn: observation.wornOn,
          endpoint: observation.endpoint,
          temperature: observation.temperature,
          feeling: observation.feeling,
          place: observation.placeId
            ? (placeById.get(observation.placeId) ?? observation.placeId)
            : null,
          transport: observation.transportModeId
            ? (transportById.get(observation.transportModeId) ??
              observation.transportModeId)
            : null,
        }))
      }

      function derivedDiagnostics(candidate: SparseEligibilityCandidate) {
        return candidate.derived.items.map((itemEvidence) => ({
          item: itemEvidence.itemName,
          category: itemEvidence.category,
          weight: itemEvidence.thermalWeight,
          baseLayerOnlyCannotQualify:
            itemEvidence.isBaseLayerSourceExcluded,
          scopes: Object.fromEntries(
            SCOPES.map((scope) => {
              const evidence = itemEvidence.scopes[scope]
              return [
                scope,
                {
                  rawOkTemperatures: evidence.rawOkTemperatures,
                  expandedOkRange: evidence.expandedOkRange,
                  cold: evidence.coldObservations.map((entry) => ({
                    wearLogId: entry.wearLogId,
                    temperature: entry.temperature,
                  })),
                  hot: evidence.hotObservations.map((entry) => ({
                    wearLogId: entry.wearLogId,
                    temperature: entry.temperature,
                  })),
                  matchedWearLogIds: evidence.matchedWearLogIds,
                  sourceOutfits: evidence.distinctOutfitIds.map((outfitId) =>
                    outfitLabel(
                      invariant(outfitById.get(outfitId), 'Outfit missing'),
                    ),
                  ),
                  observationCount: evidence.observationCount,
                  distinctWearLogCount: evidence.distinctWearLogCount,
                  latestWornOn: evidence.latestWornOn,
                  inferredReturnEndpointCount:
                    evidence.inferredReturnEndpointCount,
                  sourcePlaces: evidence.sourcePlaceIds.map((placeId) =>
                    placeId ? (placeById.get(placeId) ?? placeId) : null,
                  ),
                  sourceTransports: evidence.sourceTransportModeIds.map(
                    (transportId) =>
                      transportId
                        ? (transportById.get(transportId) ?? transportId)
                        : null,
                  ),
                },
              ]
            }),
          ),
        }))
      }

      function selectionRow(
        simulation: SparseEligibilitySimulation,
        sourceIndex: number,
      ) {
        const selection = simulation.selections[sourceIndex]
        if (!selection) return null
        return {
          outfit: outfitLabel(selection.result.outfit),
          ...sourceDiagnostics(selection.sourceItemId, selection.noveltyDate),
          basis: selection.decision.basis,
          directWearLogCount:
            selection.decision.candidate.direct.distinctWearLogCount,
          directRange:
            selection.decision.candidate.direct.currentExpandedOkRange,
          primaryDirectRange:
            selection.decision.candidate.direct.primaryExpandedOkRange,
          inferredSensitivity:
            selection.decision.candidate.direct.inferredRangeSensitivity,
        }
      }

      const scenarios = [26, 28, 30, 33].map((temperature) => {
        const input = inputFor(temperature)
        const results = recommendOutfits(data, input)
        const homeBefore = partitionRecommendations(results)
        const homeSnapshot = structuredClone(homeBefore)
        const candidates = buildSparseEligibilityCandidates({
          data,
          input,
          results,
          noveltyOverlay,
        })
        const simulations = [
          simulateSparseRecentPurchaseEligibility({
            candidates,
            noveltyOverlay,
            model: 'S0',
          }),
          ...(['S1', 'S2', 'S3'] as const).flatMap((model) =>
            RULES.map((aggregationRule) =>
              simulateSparseRecentPurchaseEligibility({
                candidates,
                noveltyOverlay,
                model,
                aggregationRule,
              }),
            ),
          ),
        ]
        expect(partitionRecommendations(results)).toEqual(homeSnapshot)
        const s0 = invariant(
          simulations.find((simulation) => simulation.model === 'S0'),
          'S0 missing',
        )
        const s0Eligible = new Set(
          s0.decisions
            .filter((decision) => decision.eligible)
            .map((decision) => decision.candidate.result.outfit.id),
        )
        const simulationRows = simulations.map((simulation) => {
          const eligibleIds = new Set(
            simulation.decisions
              .filter((decision) => decision.eligible)
              .map((decision) => decision.candidate.result.outfit.id),
          )
          const recovered = simulation.decisions.filter(
            (decision) =>
              decision.eligible &&
              !s0Eligible.has(decision.candidate.result.outfit.id),
          )
          const removed = [...s0Eligible].filter((id) => !eligibleIds.has(id))
          return {
            model: simulation.model,
            aggregationRule: simulation.aggregationRule,
            eligibleOutfitCount: simulation.thermalEligibleOutfitCount,
            sourceEligibleOutfitCount: simulation.sourceEligibleOutfitCount,
            distinctNoveltySourceItemCount:
              simulation.distinctNoveltySourceItemCount,
            candidateGroupSizeBeforeN3: simulation.sourceEligibleOutfitCount,
            candidateGroupSizeAfterN3: simulation.selections.length,
            topThree: simulation.selections.map((_selection, index) =>
              selectionRow(simulation, index),
            ),
            recoveredOutfitCount: recovered.length,
            removedOutfitCount: removed.length,
            recoveredZeroWear: recovered.filter(
              (decision) =>
                decision.candidate.direct.distinctWearLogCount === 0,
            ).length,
            recoveredOneWear: recovered.filter(
              (decision) =>
                decision.candidate.direct.distinctWearLogCount === 1,
            ).length,
            recoveredBasis: Object.fromEntries(
              [
                'exact-context-items',
                'current-transport-items',
                'overall-items',
              ].map((basis) => [
                basis,
                recovered.filter((decision) => decision.basis === basis).length,
              ]),
            ),
            directOutcomes: Object.fromEntries(
              ['support', 'issue', 'mixed', 'unknown'].map((outcome) => [
                outcome,
                simulation.decisions.filter(
                  (decision) =>
                    decision.candidate.direct.outcomeNearTarget === outcome,
                ).length,
              ]),
            ),
            inferredSensitiveCandidateCount: simulation.decisions.filter(
              (decision) =>
                decision.candidate.direct.inferredRangeSensitivity,
            ).length,
          }
        })
        return {
          temperature,
          input: {
            place: nearbyPlace.name,
            transport: shortTransport.name,
            rainCondition: input.rainCondition,
            longWalkCondition: input.longWalkCondition,
          },
          productionHomeRecentPurchases: homeBefore.recentPurchases.map(
            (result) => outfitLabel(result.outfit),
          ),
          candidates,
          simulations,
          simulationRows,
        }
      })

      const scenario28 = invariant(
        scenarios.find((scenario) => scenario.temperature === 28),
        '28C scenario missing',
      )
      const scenario33 = invariant(
        scenarios.find((scenario) => scenario.temperature === 33),
        '33C scenario missing',
      )
      const s0At28 = invariant(
        scenario28.simulations.find((simulation) => simulation.model === 'S0'),
        '28C S0 missing',
      )
      const s0At33 = invariant(
        scenario33.simulations.find((simulation) => simulation.model === 'S0'),
        '33C S0 missing',
      )
      const selected33Ids = new Set(
        s0At33.selections.map((selection) => selection.result.outfit.id),
      )
      const excluded28 = s0At28.selections
        .filter((selection) => !selected33Ids.has(selection.result.outfit.id))
        .map((selection) => {
          const candidate = invariant(
            scenario33.candidates.find(
              (entry) => entry.result.outfit.id === selection.result.outfit.id,
            ),
            '33C candidate missing',
          )
          return {
            outfit: outfitLabel(selection.result.outfit),
            ...sourceDiagnostics(selection.sourceItemId, selection.noveltyDate),
            directWearLogCount: candidate.direct.distinctWearLogCount,
            directObservations: directObservations(candidate),
            directRange: candidate.direct.currentExpandedOkRange,
            primaryDirectRange: candidate.direct.primaryExpandedOkRange,
            exclusionReason:
              candidate.direct.distinctWearLogCount === 1
                ? 'one sparse direct Outfit log; 33C outside direct range'
                : candidate.direct.hasRelevantDirectIssue
                  ? 'direct thermal issue near 33C'
                  : '33C outside direct Outfit range before N3 selection',
            directIssueNear33: candidate.direct.hasRelevantDirectIssue,
            similarOutfitSupport: candidate.similarOutfits
              .filter((match) => match.supportsTarget)
              .map((match) => ({
                outfit: outfitLabel(
                  invariant(outfitById.get(match.outfitId), 'Outfit missing'),
                ),
                range: match.okRange,
                matchedWearLogIds: match.matchedWearLogIds,
              })),
            inferredSensitivity: candidate.direct.inferredRangeSensitivity,
            itemEvidence: derivedDiagnostics(candidate),
          }
        })

      const current33Cards = s0At33.selections.map((selection) => {
        const candidate = selection.decision.candidate
        const endpointContexts = directObservations(candidate).filter(
          (observation) => observation.feeling === 'ok',
        )
        return {
          outfit: outfitLabel(selection.result.outfit),
          ...sourceDiagnostics(selection.sourceItemId, selection.noveltyDate),
          directWearLogCount: candidate.direct.distinctWearLogCount,
          directOkTemperatures: candidate.direct.directOkTemperatures,
          directColdTemperatures: candidate.direct.directColdTemperatures,
          directHotTemperatures: candidate.direct.directHotTemperatures,
          directExpandedRange: candidate.direct.currentExpandedOkRange,
          rangeEndpointContexts: endpointContexts,
          exactContextDirectEvidence: endpointContexts.filter(
            (observation) =>
              observation.place === nearbyPlace.name &&
              observation.transport === shortTransport.name,
          ),
          passesBecause: 'observed Outfit OK range contains 33C',
          nonCurrentContextResponsible:
            endpointContexts.some(
              (observation) =>
                observation.place !== nearbyPlace.name ||
                observation.transport !== shortTransport.name,
            ) &&
            endpointContexts.every(
              (observation) =>
                observation.place !== nearbyPlace.name ||
                observation.transport !== shortTransport.name,
            ),
        }
      })

      const allSimulations = scenarios.flatMap((scenario) =>
        scenario.simulations.map((simulation) => ({
          temperature: scenario.temperature,
          simulation,
        })),
      )
      const recencyDiagnostic = allSimulations.map(
        ({ temperature, simulation }) => {
          const sources = simulation.selections.map((selection) =>
            sourceDiagnostics(selection.sourceItemId, selection.noveltyDate),
          )
          return {
            temperature,
            model: simulation.model,
            aggregationRule: simulation.aggregationRule,
            noExpiration: sources.length,
            within365Days: sources.filter((source) => source.within365Days)
              .length,
            within730Days: sources.filter((source) => source.within730Days)
              .length,
            wearBuckets: Object.fromEntries(
              ['0', '1', '2-4', '5+'].map((bucket) => [
                bucket,
                sources.filter((source) => source.wearBucket === bucket).length,
              ]),
            ),
          }
        },
      )

      const recovered33 = scenario33.simulations.flatMap((simulation) => {
        if (simulation.model === 'S0') return []
        const s0Ids = new Set(
          s0At33.decisions
            .filter((decision) => decision.eligible)
            .map((decision) => decision.candidate.result.outfit.id),
        )
        return simulation.decisions
          .filter(
            (decision) =>
              decision.eligible &&
              !s0Ids.has(decision.candidate.result.outfit.id),
          )
          .map((decision) => ({
            model: simulation.model,
            aggregationRule: simulation.aggregationRule,
            outfit: outfitLabel(decision.candidate.result.outfit),
            basis: decision.basis,
            directWearLogCount:
              decision.candidate.direct.distinctWearLogCount,
            directRange: decision.candidate.direct.currentExpandedOkRange,
            aggregation: decision.aggregation,
            itemEvidence: derivedDiagnostics(decision.candidate),
            similarOutfitSupport: decision.candidate.similarOutfits
              .filter((match) => match.supportsTarget)
              .map((match) => ({
                outfit: outfitLabel(
                  invariant(outfitById.get(match.outfitId), 'Outfit missing'),
                ),
                matchedWearLogIds: match.matchedWearLogIds,
                range: match.okRange,
              })),
          }))
      })

      const output = {
        readOnly: true,
        asOf: AUDIT_AS_OF,
        inputContext: {
          place: nearbyPlace.name,
          transport: shortTransport.name,
        },
        current33Cards,
        excluded28,
        scenarios: scenarios.map(
          ({ candidates: _candidates, simulations: _simulations, ...scenario }) =>
            scenario,
        ),
        recovered33,
        recencyDiagnostic,
      }
      expect(output.readOnly).toBe(true)
      const compactRecovered33 = [
        ...new Map(
          recovered33.map((entry) => [entry.outfit, entry]),
        ).values(),
      ].map((entry) => ({
        outfit: entry.outfit,
        sourceItems: entry.itemEvidence.flatMap((item) =>
          item.scopes.overall.observationCount > 0 ? [item.item] : [],
        ),
        recoveredBy: recovered33
          .filter((candidate) => candidate.outfit === entry.outfit)
          .map((candidate) => ({
            model: candidate.model,
            aggregationRule: candidate.aggregationRule,
            basis: candidate.basis,
          })),
        directWearLogCount: entry.directWearLogCount,
        directRange: entry.directRange,
        itemEvidence: entry.itemEvidence.map((item) => ({
          item: item.item,
          category: item.category,
          weight: item.weight,
          scopes: Object.fromEntries(
            SCOPES.map((scope) => [
              scope,
              {
                ok: item.scopes[scope].rawOkTemperatures,
                range: item.scopes[scope].expandedOkRange,
                cold: item.scopes[scope].cold,
                hot: item.scopes[scope].hot,
                logCount: item.scopes[scope].matchedWearLogIds.length,
                outfits: item.scopes[scope].sourceOutfits,
                places: item.scopes[scope].sourcePlaces,
                transports: item.scopes[scope].sourceTransports,
                inferred: item.scopes[scope].inferredReturnEndpointCount,
              },
            ]),
          ),
        })),
      }))
      const compactOutput = {
        readOnly: output.readOnly,
        asOf: output.asOf,
        inputContext: output.inputContext,
        current33Cards: output.current33Cards,
        excluded28: output.excluded28.map((entry) => ({
          ...entry,
          itemEvidence: entry.itemEvidence.map((item) => ({
            item: item.item,
            category: item.category,
            weight: item.weight,
            scopes: Object.fromEntries(
              SCOPES.map((scope) => [
                scope,
                {
                  ok: item.scopes[scope].rawOkTemperatures,
                  range: item.scopes[scope].expandedOkRange,
                  cold: item.scopes[scope].cold,
                  hot: item.scopes[scope].hot,
                  logCount: item.scopes[scope].matchedWearLogIds.length,
                  outfits: item.scopes[scope].sourceOutfits,
                  places: item.scopes[scope].sourcePlaces,
                  transports: item.scopes[scope].sourceTransports,
                  inferred: item.scopes[scope].inferredReturnEndpointCount,
                },
              ]),
            ),
          })),
        })),
        scenarios: output.scenarios.map((scenario) => ({
          temperature: scenario.temperature,
          input: scenario.input,
          productionHomeRecentPurchases:
            scenario.productionHomeRecentPurchases,
          simulations: scenario.simulationRows.map((simulation) => ({
            ...simulation,
            topThree: simulation.topThree.map((selection) =>
              selection
                ? {
                    outfit: selection.outfit,
                    sourceItem: selection.sourceItem,
                    acquisitionDate: selection.acquisitionDate,
                    ageDays: selection.ageDays,
                    totalItemWearCount: selection.totalItemWearCount,
                    basis: selection.basis,
                    directWearLogCount: selection.directWearLogCount,
                    directRange: selection.directRange,
                    inferredSensitivity: selection.inferredSensitivity,
                  }
                : null,
            ),
          })),
        })),
        recovered33: compactRecovered33,
        recencyDiagnostic: output.recencyDiagnostic,
      }
      const decisionSummary = {
        scenarios: compactOutput.scenarios.map((scenario) => ({
          temperature: scenario.temperature,
          productionHomeRecentPurchases:
            scenario.productionHomeRecentPurchases,
          simulations: scenario.simulations.map((simulation) => ({
            model: simulation.model,
            aggregationRule: simulation.aggregationRule,
            eligibleOutfitCount: simulation.eligibleOutfitCount,
            sourceEligibleOutfitCount: simulation.sourceEligibleOutfitCount,
            distinctNoveltySourceItemCount:
              simulation.distinctNoveltySourceItemCount,
            topThree: simulation.topThree.map((selection) =>
              selection
                ? `${selection.outfit} [${selection.basis}]`
                : null,
            ),
            recoveredOutfitCount: simulation.recoveredOutfitCount,
            removedOutfitCount: simulation.removedOutfitCount,
            recoveredZeroWear: simulation.recoveredZeroWear,
            recoveredOneWear: simulation.recoveredOneWear,
            recoveredBasis: simulation.recoveredBasis,
            inferredSensitiveCandidateCount:
              simulation.inferredSensitiveCandidateCount,
          })),
        })),
        excluded28: compactOutput.excluded28.map((entry) => ({
          outfit: entry.outfit,
          sourceItem: entry.sourceItem,
          directWearLogCount: entry.directWearLogCount,
          directRange: entry.directRange,
          directIssueNear33: entry.directIssueNear33,
          similarOutfitSupport: entry.similarOutfitSupport,
          itemScopeRanges: entry.itemEvidence.map((item) => ({
            item: item.item,
            exactContext: item.scopes.exactContext.range,
            currentTransport: item.scopes.currentTransport.range,
            overall: item.scopes.overall.range,
            exactIssueCount:
              item.scopes.exactContext.cold.length +
              item.scopes.exactContext.hot.length,
          })),
        })),
        recovered33: compactOutput.recovered33.map((entry) => ({
          outfit: entry.outfit,
          recoveredBy: entry.recoveredBy,
          directWearLogCount: entry.directWearLogCount,
          directRange: entry.directRange,
          itemScopeRanges: entry.itemEvidence.map((item) => ({
            item: item.item,
            exactContext: item.scopes.exactContext.range,
            currentTransport: item.scopes.currentTransport.range,
            overall: item.scopes.overall.range,
            exactContexts: {
              outfits: item.scopes.exactContext.outfits,
              places: item.scopes.exactContext.places,
              transports: item.scopes.exactContext.transports,
            },
          })),
        })),
      }
      const requestedReportTemperature = Number(
        process.env.PHASE5_SPARSE_REPORT_TEMPERATURE,
      )
      const hasRequestedReportTemperature = [26, 28, 30, 33].includes(
        requestedReportTemperature,
      )
      const essentialOutput = {
        readOnly: compactOutput.readOnly,
        asOf: compactOutput.asOf,
        inputContext: compactOutput.inputContext,
        matrix: decisionSummary.scenarios
          .filter(
            (scenario) =>
              !hasRequestedReportTemperature ||
              scenario.temperature === requestedReportTemperature,
          )
          .map((scenario) => ({
          temperature: scenario.temperature,
          productionHomeRecentPurchases:
            scenario.productionHomeRecentPurchases,
          simulations: scenario.simulations.map((simulation) => ({
            model: simulation.model,
            aggregationRule: simulation.aggregationRule,
            eligibleOutfitCount: simulation.eligibleOutfitCount,
            sourceEligibleOutfitCount: simulation.sourceEligibleOutfitCount,
            distinctNoveltySourceItemCount:
              simulation.distinctNoveltySourceItemCount,
            topThree: simulation.topThree,
            recoveredOutfitCount: simulation.recoveredOutfitCount,
            recoveredZeroWear: simulation.recoveredZeroWear,
            recoveredOneWear: simulation.recoveredOneWear,
            recoveredBasis: simulation.recoveredBasis,
          })),
          })),
        current33Cards:
          !hasRequestedReportTemperature || requestedReportTemperature === 33
            ? compactOutput.current33Cards
            : [],
        excluded28:
          !hasRequestedReportTemperature || requestedReportTemperature === 33
            ? decisionSummary.excluded28
            : [],
        recovered33:
          !hasRequestedReportTemperature || requestedReportTemperature === 33
            ? decisionSummary.recovered33
            : [],
        recencyDiagnostic: compactOutput.recencyDiagnostic.filter(
          (entry) =>
            !hasRequestedReportTemperature ||
            entry.temperature === requestedReportTemperature,
        ),
      }
      process.stdout.write(
        `\nPHASE5_SPARSE_ITEM_EVIDENCE_PRIVATE_REPORT\n${JSON.stringify(essentialOutput, null, 2)}\n`,
      )
    }, 120_000)
  },
)
