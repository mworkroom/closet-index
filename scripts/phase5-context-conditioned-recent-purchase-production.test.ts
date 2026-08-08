import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  buildContextEligibilityCandidates,
  simulateContextRecentPurchases,
  type ContextEligibilityCandidate,
  type ContextEligibilityState,
} from '../src/lib/context-conditioned-recent-purchase'
import { applyContextConditionedRecentPurchaseC1N3 } from '../src/lib/context-conditioned-recent-purchase-home'
import {
  applyAuthoritativeNoveltyOverrides,
  deriveInitialNoveltyDate,
  type AuthoritativeNoveltyOverride,
  type InitialNoveltyEvidence,
} from '../src/lib/recent-purchase-semantics'
import {
  partitionRecommendations,
  recommendOutfits,
} from '../src/lib/recommendation'
import {
  noveltyAgeDays,
  simulateRecencyBoundedRecentPurchases,
  type MissingContextRecencyBehavior,
  type RecencyWindowModel,
} from '../src/lib/recent-purchase-recency-window'
import {
  applyRecentPurchaseW2Home,
  currentKstCalendarDate,
} from '../src/lib/recent-purchase-w2-home'
import type {
  AppData,
  Item,
  Outfit,
  PurchaseEvent,
  RecommendationInput,
  RecommendationResult,
  WearLog,
} from '../src/lib/types'

const RUN_PRODUCTION_AUDIT =
  process.env.RUN_PHASE5_CONTEXT_ELIGIBILITY_PRODUCTION === 'true'
const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'
const STATES: ContextEligibilityState[] = [
  'exact_support',
  'exact_issue',
  'exact_mixed',
  'current_transport_support',
  'cross_context_only',
  'untried',
  'unknown',
]

function invariant<T>(value: T, message: string): NonNullable<T> {
  if (value === null || value === undefined || value === '') {
    throw new Error(message)
  }
  return value as NonNullable<T>
}

describe.runIf(RUN_PRODUCTION_AUDIT)(
  'read-only production context-conditioned Recent Purchase audit',
  () => {
    it('compares C0-C4 without changing production HOME', async () => {
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
      const outfitById = new Map(outfits.map((outfit) => [outfit.id, outfit]))
      const placeById = new Map(places.map((place) => [place.id, place.name]))
      const transportById = new Map(
        transportModes.map((transport) => [transport.id, transport.name]),
      )
      const eventsByItemId = new Map<string, PurchaseEvent[]>()
      for (const event of purchaseEvents) {
        const events = eventsByItemId.get(event.itemId) ?? []
        events.push(event)
        eventsByItemId.set(event.itemId, events)
      }
      const baselineNovelty = new Map<string, InitialNoveltyEvidence>(
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
        baselineNovelty,
        overrides,
      )
      const outfitLabel = (outfit: Outfit) =>
        outfit.displayName?.trim() ||
        outfit.itemIds
          .map((itemId) => itemById.get(itemId)?.name)
          .filter(Boolean)
          .join(' + ') ||
        'Unnamed Outfit'

      const shortTransport = invariant(
        transportModes.find((transport) =>
          /short|near|근거리/iu.test(transport.name),
        ),
        'short-walk Transport missing',
      )
      const carTransport = invariant(
        transportModes.find((transport) => /car|차/iu.test(transport.name)),
        'Car Transport missing',
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
        'nearby Place missing',
      )

      const input = (
        temperature: number,
        placeId: string | null = nearbyPlace.id,
        transportModeId: string | null = shortTransport.id,
      ): RecommendationInput => ({
        tempOut: temperature,
        tempBack: null,
        rainCondition: 'no',
        longWalkCondition: 'no',
        placeId,
        transportModeId,
      })
      const auditAsOfDate = currentKstCalendarDate()

      function evidenceSummary(candidate: ContextEligibilityCandidate) {
        const scope = (name: 'exactContext' | 'currentTransport' | 'overall') => {
          const evidence = candidate.context[name]
          return {
            outcome: evidence.outcome,
            range: evidence.expandedOkRange,
            matchedWearLogIds: evidence.matchedWearLogIds,
            observations: evidence.relevantObservations.map((observation) => ({
              wearLogId: observation.wearLogId,
              wornOn: observation.wornOn,
              endpoint: observation.endpoint,
              temperature: observation.historicalTemperature,
              feeling: observation.feeling,
              place: observation.placeId
                ? (placeById.get(observation.placeId) ?? observation.placeId)
                : null,
              transport: observation.transportModeId
                ? (transportById.get(observation.transportModeId) ??
                  observation.transportModeId)
                : null,
            })),
            inferredReturnEndpointCount: evidence.inferredReturnEndpointCount,
          }
        }
        return {
          state: candidate.context.state,
          directWearLogCount: candidate.context.totalDistinctWearLogCount,
          exactContext: scope('exactContext'),
          currentTransport: scope('currentTransport'),
          overall: scope('overall'),
        }
      }

      function runScenario(
        name: string,
        scenarioInput: RecommendationInput,
        includeDisabledFallback = false,
      ) {
        const results = recommendOutfits(data, scenarioInput)
        const baselineGroups = partitionRecommendations(results)
        const homeBefore = structuredClone(baselineGroups)
        const featureOff = applyContextConditionedRecentPurchaseC1N3({
          data,
          input: scenarioInput,
          results,
          baselineGroups,
          enabled: false,
        })
        const featureOn = applyContextConditionedRecentPurchaseC1N3({
          data,
          input: scenarioInput,
          results,
          baselineGroups,
          enabled: true,
        })
        const w2FeatureOff = applyRecentPurchaseW2Home({
          data,
          input: scenarioInput,
          results,
          baselineGroups,
          enabled: false,
          asOfDate: auditAsOfDate,
        })
        const w2FeatureOn = applyRecentPurchaseW2Home({
          data,
          input: scenarioInput,
          results,
          baselineGroups,
          enabled: true,
          asOfDate: auditAsOfDate,
        })
        expect(featureOff.groups).toBe(baselineGroups)
        expect(featureOff.groups).toEqual(homeBefore)
        expect(featureOff.groups.recentPurchases).toBe(
          baselineGroups.recentPurchases,
        )
        expect(featureOff.groups.recommendations).toBe(
          baselineGroups.recommendations,
        )
        expect(featureOff.groups.trialRecommendations).toBe(
          baselineGroups.trialRecommendations,
        )
        expect(w2FeatureOff.groups).toBe(baselineGroups)
        expect(w2FeatureOff.groups).toEqual(homeBefore)
        expect(w2FeatureOff.groups.recentPurchases).toBe(
          baselineGroups.recentPurchases,
        )
        expect(w2FeatureOff.groups.recommendations).toBe(
          baselineGroups.recommendations,
        )
        expect(w2FeatureOff.groups.trialRecommendations).toBe(
          baselineGroups.trialRecommendations,
        )
        const baselineMembership = [
          ...baselineGroups.recentPurchases,
          ...baselineGroups.recommendations,
          ...baselineGroups.trialRecommendations,
        ]
          .map((result) => result.outfit.id)
          .sort()
        const featureOnMembership = [
          ...featureOn.groups.recentPurchases,
          ...featureOn.groups.recommendations,
          ...featureOn.groups.trialRecommendations,
        ]
          .map((result) => result.outfit.id)
          .sort()
        expect(featureOnMembership).toEqual(baselineMembership)
        const w2FeatureOnMembership = [
          ...w2FeatureOn.groups.recentPurchases,
          ...w2FeatureOn.groups.recommendations,
          ...w2FeatureOn.groups.trialRecommendations,
        ]
          .map((result) => result.outfit.id)
          .sort()
        expect(w2FeatureOnMembership).toEqual(baselineMembership)
        expect(w2FeatureOn.groups.trialRecommendations).toBe(
          baselineGroups.trialRecommendations,
        )
        expect(featureOn.groups.trialRecommendations).toBe(
          baselineGroups.trialRecommendations,
        )
        expect(
          featureOn.groups.recommendations.map((result) => result.outfit.id),
        ).toEqual(
          results
            .filter(
              (result) =>
                result.evidence === 'observed' &&
                !featureOn.groups.recentPurchases.some(
                  (recent) => recent.outfit.id === result.outfit.id,
                ),
            )
            .map((result) => result.outfit.id),
        )
        const candidates = buildContextEligibilityCandidates({
          data,
          input: scenarioInput,
          results,
          noveltyOverlay,
        })
        const variants = [
          { key: 'C0', model: 'C0' as const },
          { key: 'C1', model: 'C1' as const },
          { key: 'C2', model: 'C2' as const },
          {
            key: 'C3-report-only',
            model: 'C3' as const,
            c3TransportVariant: 'report-only' as const,
          },
          {
            key: 'C3-transport-eligible',
            model: 'C3' as const,
            c3TransportVariant: 'eligible' as const,
          },
          { key: 'C4', model: 'C4' as const },
        ]
        const simulations = variants.map((variant) => ({
          key: variant.key,
          simulation: simulateContextRecentPurchases({
            candidates,
            noveltyOverlay,
            model: variant.model,
            c3TransportVariant: variant.c3TransportVariant,
            missingContextFallback: 'current-c0',
          }),
        }))
        const disabledFallback = includeDisabledFallback
          ? variants
              .filter((variant) => variant.model !== 'C0')
              .map((variant) => ({
                key: variant.key,
                simulation: simulateContextRecentPurchases({
                  candidates,
                  noveltyOverlay,
                  model: variant.model,
                  c3TransportVariant: variant.c3TransportVariant,
                  missingContextFallback: 'disabled',
                }),
              }))
          : []
        const c0 = invariant(
          simulations.find((entry) => entry.key === 'C0'),
          'C0 simulation missing',
        )
        expect(
          c0.simulation.selections.map(
            (selection) => selection.result.outfit.id,
          ).sort(),
        ).toEqual(
          homeBefore.recentPurchases
            .map((result) => result.outfit.id)
            .sort(),
        )
        expect(partitionRecommendations(results)).toEqual(homeBefore)
        const selectionRow = (
          selection: (typeof simulations)[number]['simulation']['selections'][number],
        ) => ({
          outfit: outfitLabel(selection.result.outfit),
          sourceItem: invariant(
            itemById.get(selection.sourceItemId),
            'source Item missing',
          ).name,
          noveltyDate: selection.noveltyDate,
          state: selection.decision.candidate.context.state,
          tier: selection.decision.tier,
          reason: selection.decision.reason,
          evidence: evidenceSummary(selection.decision.candidate),
        })
        const simulationRow = (entry: (typeof simulations)[number]) => ({
          model: entry.key,
          eligibleOutfitCount: entry.simulation.eligibleOutfitCount,
          distinctNoveltySourceItemCount:
            entry.simulation.distinctNoveltySourceItemCount,
          cardCount: entry.simulation.selections.length,
          returnedFewerThanThree: entry.simulation.returnedFewerThanLimit,
          stateDistribution: Object.fromEntries(
            STATES.map((state) => [
              state,
              entry.simulation.decisions.filter(
                (decision) => decision.candidate.context.state === state,
              ).length,
            ]),
          ),
          cards: entry.simulation.selections.map(selectionRow),
        })
        const featureOnSimulation = featureOn.simulation
        const sourceIds =
          featureOnSimulation?.selections.map(
            (selection) => selection.sourceItemId,
          ) ?? []
        const integrationReport = {
          applied: featureOn.applied,
          usedCurrentFallback: featureOn.usedCurrentFallback,
          featureOffDeepEqual: featureOff.groups === baselineGroups,
          baselineRecent: baselineGroups.recentPurchases.map((entry) =>
            outfitLabel(entry.outfit),
          ),
          featureOnRecent:
            featureOnSimulation?.selections.map((selection) => ({
              outfit: outfitLabel(selection.result.outfit),
              sourceItem: invariant(
                itemById.get(selection.sourceItemId),
                'source Item missing',
              ).name,
              noveltyDate: selection.noveltyDate,
              evidence: evidenceSummary(selection.decision.candidate),
            })) ??
            featureOn.groups.recentPurchases.map((entry) => ({
              outfit: outfitLabel(entry.outfit),
              sourceItem: null,
              noveltyDate: null,
              evidence: null,
            })),
          movedFromRecentToNormal: featureOn.movedToRecommendations.map(
            (entry) => ({
              outfit: outfitLabel(entry.outfit),
              normalRank:
                featureOn.groups.recommendations.findIndex(
                  (result) => result.outfit.id === entry.outfit.id,
                ) + 1,
            }),
          ),
          normalTopSix: featureOn.groups.recommendations
            .slice(0, 6)
            .map((entry) => outfitLabel(entry.outfit)),
          trialIdentityPreserved:
            featureOn.groups.trialRecommendations ===
            baselineGroups.trialRecommendations,
          lostCandidateCount:
            baselineMembership.filter(
              (outfitId) => !featureOnMembership.includes(outfitId),
            ).length,
          duplicateSourceItemCount:
            sourceIds.length - new Set(sourceIds).size,
          duplicateOutfitCount:
            featureOn.groups.recentPurchases.length -
            new Set(
              featureOn.groups.recentPurchases.map(
                (entry) => entry.outfit.id,
              ),
            ).size,
        }
        const w2SourceIds =
          w2FeatureOn.simulation?.selections.map(
            (selection) => selection.sourceItemId,
          ) ?? []
        const w2IntegrationReport = {
          applied: w2FeatureOn.applied,
          usedMissingContextFallback:
            w2FeatureOn.usedMissingContextFallback,
          featureOffDeepEqualAndIdentical:
            w2FeatureOff.groups === baselineGroups,
          cards:
            w2FeatureOn.simulation?.selections.map((selection) => ({
              outfit: outfitLabel(selection.result.outfit),
              sourceItem: invariant(
                itemById.get(selection.sourceItemId),
                'W2 HOME source Item missing',
              ).name,
              noveltyDate: selection.noveltyDate,
              ageDays: selection.ageDays,
              tier: selection.tier,
              contextState:
                selection.decision.candidate.context.state,
            })) ?? [],
          movedToNormal: w2FeatureOn.movedToRecommendations.map((result) => ({
            outfit: outfitLabel(result.outfit),
            normalRank:
              w2FeatureOn.groups.recommendations.findIndex(
                (entry) => entry.outfit.id === result.outfit.id,
              ) + 1,
          })),
          duplicateSourceCount:
            w2SourceIds.length - new Set(w2SourceIds).size,
          duplicateOutfitCount:
            w2FeatureOn.groups.recentPurchases.length -
            new Set(
              w2FeatureOn.groups.recentPurchases.map(
                (result) => result.outfit.id,
              ),
            ).size,
          candidateLossCount:
            baselineMembership.filter(
              (outfitId) => !w2FeatureOnMembership.includes(outfitId),
            ).length,
        }
        return {
          name,
          input: {
            temperature: scenarioInput.tempOut,
            place: scenarioInput.placeId
              ? (placeById.get(scenarioInput.placeId) ?? scenarioInput.placeId)
              : null,
            transport: scenarioInput.transportModeId
              ? (transportById.get(scenarioInput.transportModeId) ??
                scenarioInput.transportModeId)
              : null,
          },
          currentHomeRecentPurchases: homeBefore.recentPurchases.map((entry) =>
            outfitLabel(entry.outfit),
          ),
          candidates,
          results,
          simulations,
          report: simulations.map(simulationRow),
          integrationReport,
          w2IntegrationReport,
          disabledFallbackReport: disabledFallback.map((entry) => ({
            model: entry.key,
            eligibleOutfitCount: entry.simulation.eligibleOutfitCount,
            cardCount: entry.simulation.selections.length,
            returnedFewerThanThree: entry.simulation.returnedFewerThanLimit,
          })),
        }
      }

      const nearbyScenarios = [26, 28, 30, 33].map((temperature) =>
        runScenario(`${temperature}C-nearby-short`, input(temperature)),
      )
      const nearby33 = invariant(
        nearbyScenarios.find((scenario) => scenario.input.temperature === 33),
        'nearby 33C missing',
      )
      const nearby33C0 = invariant(
        nearby33.simulations.find((entry) => entry.key === 'C0'),
        'nearby 33C C0 missing',
      )
      const crossContextOuterSelection = invariant(
        nearby33C0.simulation.selections.find((selection) => {
          const candidate = selection.decision.candidate
          const source = itemById.get(selection.sourceItemId)
          return (
            candidate.context.state === 'cross_context_only' &&
            source?.category.toLocaleLowerCase('en-US').includes('outer') &&
            candidate.context.overall.relevantObservations.filter(
              (observation) =>
                observation.feeling === 'ok' &&
                observation.historicalTemperature === 31,
            ).length >= 2
          )
        }),
        'audited cross-context outer card missing',
      )
      const crossOutfitId = crossContextOuterSelection.result.outfit.id
      const cinemaPlace = invariant(
        places.find((place) => /yongsan|용산/iu.test(place.name)),
        'target cinema Place missing',
      )
      const cinema33 = runScenario(
        '33C-cinema-car',
        input(33, cinemaPlace.id, carTransport.id),
      )
      const placeNull = runScenario(
        '33C-place-null-short',
        input(33, null, shortTransport.id),
        true,
      )
      const transportNull = runScenario(
        '33C-nearby-transport-null',
        input(33, nearbyPlace.id, null),
        true,
      )
      const allScenarios = [
        ...nearbyScenarios,
        cinema33,
        placeNull,
        transportNull,
      ]

      const asOfDate = auditAsOfDate

      function recencySimulation(
        scenario: (typeof allScenarios)[number],
        model: RecencyWindowModel,
        missingContextBehavior: MissingContextRecencyBehavior = 'overall',
      ) {
        const simulation = simulateRecencyBoundedRecentPurchases({
          candidates: scenario.candidates,
          noveltyOverlay,
          model,
          asOfDate,
          hasCompleteContext: Boolean(
            scenario.input.place && scenario.input.transport,
          ),
          missingContextBehavior,
        })
        const selectedOutfitIds = simulation.selections.map(
          (selection) => selection.result.outfit.id,
        )
        const selectedSourceIds = simulation.selections.map(
          (selection) => selection.sourceItemId,
        )
        expect(simulation.selections.length).toBeLessThanOrEqual(3)
        expect(new Set(selectedOutfitIds).size).toBe(selectedOutfitIds.length)
        expect(new Set(selectedSourceIds).size).toBe(selectedSourceIds.length)
        expect(
          simulation.selections.every(
            (selection) =>
              selection.ageDays >= 0 &&
              selection.ageDays <= simulation.windowDays,
          ),
        ).toBe(true)
        expect(
          [
            ...selectedOutfitIds,
            ...simulation.normalRecommendations.map(
              (result) => result.outfit.id,
            ),
          ].sort(),
        ).toEqual(
          scenario.results
            .filter((result) => result.evidence === 'observed')
            .map((result) => result.outfit.id)
            .sort(),
        )
        return simulation
      }

      function recencyCard(
        selection: ReturnType<typeof recencySimulation>['selections'][number],
      ) {
        const candidate = selection.decision.candidate
        const inferredReturnEndpointCount =
          candidate.context.exactContext.inferredReturnEndpointCount +
          candidate.context.currentTransport.inferredReturnEndpointCount +
          candidate.context.overall.inferredReturnEndpointCount
        return {
          outfit: outfitLabel(selection.result.outfit),
          sourceItem: invariant(
            itemById.get(selection.sourceItemId),
            'recency source Item missing',
          ).name,
          noveltyDate: selection.noveltyDate,
          ageDays: selection.ageDays,
          state: candidate.context.state,
          overallRange: candidate.context.overall.expandedOkRange,
          exactMatchedWearLogCount:
            candidate.context.exactContext.distinctWearLogCount,
          exactMatchedObservedEndpoints:
            candidate.context.exactContext.relevantObservations.map(
              (observation) => ({
                wornOn: observation.wornOn,
                endpoint: observation.endpoint,
                temperature: observation.historicalTemperature,
                feeling: observation.feeling,
              }),
            ),
          tier: selection.tier,
          reason: selection.reason,
          inferredReturnEndpointCount,
          inferredReturnRankingEffect: false,
        }
      }

      function recencyScenarioReport(
        scenario: (typeof allScenarios)[number],
      ) {
        const completeContext = Boolean(
          scenario.input.place && scenario.input.transport,
        )
        const w0Groups = partitionRecommendations(
          scenario.results as RecommendationResult[],
        )
        const w0OutfitIds = new Set(
          w0Groups.recentPurchases.map((result) => result.outfit.id),
        )
        const w0 = w0Groups.recentPurchases.map((result) => {
          const candidate = invariant(
            scenario.candidates.find(
              (entry) => entry.result.outfit.id === result.outfit.id,
            ),
            'W0 candidate missing',
          )
          return {
            outfit: outfitLabel(result.outfit),
            sourceItems: result.latestAcquiredItemNames,
            noveltyDate: result.latestAcquiredOn,
            ageDays: result.latestAcquiredOn
              ? noveltyAgeDays(result.latestAcquiredOn, asOfDate)
              : null,
            state: candidate.context.state,
            overallRange: candidate.context.overall.expandedOkRange,
            exactMatchedWearLogCount:
              candidate.context.exactContext.distinctWearLogCount,
            exactMatchedObservedEndpoints:
              candidate.context.exactContext.relevantObservations.map(
                (observation) => ({
                  wornOn: observation.wornOn,
                  endpoint: observation.endpoint,
                  temperature: observation.historicalTemperature,
                  feeling: observation.feeling,
                }),
              ),
            tier: 'current-unbounded',
            reason: 'current observed + overall-temperature Recent Purchase',
            inferredReturnEndpointCount:
              candidate.context.exactContext.inferredReturnEndpointCount +
              candidate.context.currentTransport.inferredReturnEndpointCount +
              candidate.context.overall.inferredReturnEndpointCount,
            inferredReturnRankingEffect: false,
          }
        })
        const models = (['W1', 'W2', 'W3'] as const).map((model) => {
          const simulation = recencySimulation(scenario, model, 'overall')
          return {
            model,
            windowDays: simulation.windowDays,
            cardCount: simulation.selections.length,
            cards: simulation.selections.map((selection) => ({
              ...recencyCard(selection),
              presentInOriginalW0: w0OutfitIds.has(
                selection.result.outfit.id,
              ),
            })),
            originalW0CardsPastWindow: w0Groups.recentPurchases
              .filter(
                (result) =>
                  result.latestAcquiredOn !== null &&
                  noveltyAgeDays(result.latestAcquiredOn, asOfDate) >
                    simulation.windowDays,
              )
              .map((result) => outfitLabel(result.outfit)),
            normalMembershipPreserved: true,
            candidateLossCount: 0,
            diagnostics: simulation.diagnostics,
          }
        })
        const missingContextComparison = completeContext
          ? null
          : (['W1', 'W2'] as const).map((model) => {
              const overall = recencySimulation(scenario, model, 'overall')
              const hidden = recencySimulation(scenario, model, 'hide')
              return {
                model,
                overall: {
                  cardCount: overall.selections.length,
                  cards: overall.selections.map(recencyCard),
                },
                hidden: {
                  cardCount: hidden.selections.length,
                  cards: hidden.selections.map(recencyCard),
                },
              }
            })
        return {
          name: scenario.name,
          input: scenario.input,
          W0: { cardCount: w0.length, cards: w0 },
          models,
          missingContextComparison,
        }
      }

      const candidateFor = (
        scenario: (typeof allScenarios)[number],
        outfitId: string,
      ) =>
        invariant(
          scenario.candidates.find(
            (candidate) => candidate.result.outfit.id === outfitId,
          ),
          'candidate missing',
        )
      const modelStatusFor = (
        scenario: (typeof allScenarios)[number],
        outfitId: string,
      ) =>
        Object.fromEntries(
          scenario.simulations.map((entry) => {
            const decision = entry.simulation.decisions.find(
              (candidate) => candidate.candidate.result.outfit.id === outfitId,
            )
            return [
              entry.key,
              {
                eligible: decision?.eligible ?? false,
                selected: entry.simulation.selections.some(
                  (selection) => selection.result.outfit.id === outfitId,
                ),
              },
            ]
          }),
        )
      const linenReview = {
        outfit: outfitLabel(crossContextOuterSelection.result.outfit),
        sourceItem: invariant(
          itemById.get(crossContextOuterSelection.sourceItemId),
          'source missing',
        ).name,
        nearbyShort: evidenceSummary(candidateFor(nearby33, crossOutfitId)),
        nearbyModelStatus: modelStatusFor(nearby33, crossOutfitId),
        cinemaCar: evidenceSummary(candidateFor(cinema33, crossOutfitId)),
        cinemaModelStatus: modelStatusFor(cinema33, crossOutfitId),
      }

      const nearby28 = invariant(
        nearbyScenarios.find((scenario) => scenario.input.temperature === 28),
        'nearby 28C missing',
      )
      const nearby28C0 = invariant(
        nearby28.simulations.find((entry) => entry.key === 'C0'),
        'nearby 28C C0 missing',
      )
      const cards28At33 = nearby28C0.simulation.selections.map((selection) => {
        const at33 = candidateFor(nearby33, selection.result.outfit.id)
        return {
          outfit: outfitLabel(selection.result.outfit),
          sourceItem: invariant(
            itemById.get(selection.sourceItemId),
            'source missing',
          ).name,
          stateAt33: at33.context.state,
          evidenceAt33: evidenceSummary(at33),
          modelStatusAt33: modelStatusFor(
            nearby33,
            selection.result.outfit.id,
          ),
        }
      })

      expect(linenReview.nearbyShort.state).toBe('cross_context_only')
      expect(linenReview.nearbyModelStatus.C1).toEqual({
        eligible: false,
        selected: false,
      })
      expect(linenReview.nearbyModelStatus['C3-report-only']).toEqual({
        eligible: false,
        selected: false,
      })
      expect(linenReview.nearbyModelStatus.C4).toEqual({
        eligible: true,
        selected: false,
      })
      expect(linenReview.cinemaCar.state).toBe('exact_support')
      expect(linenReview.cinemaModelStatus.C1.eligible).toBe(true)

      function normalDiagnostic(
        scenario: typeof nearby33 | typeof cinema33,
      ) {
        const normal = partitionRecommendations(
          scenario.results as RecommendationResult[],
        ).recommendations
        const normalCandidates = normal.map((result) =>
          candidateFor(scenario, result.outfit.id),
        )
        return {
          scenario: scenario.name,
          totalNormalRecommendations: normal.length,
          stateDistribution: Object.fromEntries(
            STATES.map((state) => [
              state,
              normalCandidates.filter(
                (candidate) => candidate.context.state === state,
              ).length,
            ]),
          ),
          topSix: normalCandidates.slice(0, 6).map((candidate) => ({
            outfit: outfitLabel(candidate.result.outfit),
            state: candidate.context.state,
            exactVerified: candidate.context.state === 'exact_support',
            lowerConfidenceTransport:
              candidate.context.state === 'current_transport_support',
          })),
        }
      }

      const output = {
        readOnly: true,
        homeOutputUnchanged: true,
        scenarios: allScenarios.map((scenario) => ({
          name: scenario.name,
          input: scenario.input,
          currentHomeRecentPurchases: scenario.currentHomeRecentPurchases,
          c1N3HomeIntegration: scenario.integrationReport,
          models: scenario.report,
          disabledFallback: scenario.disabledFallbackReport,
        })),
        linenReview,
        cards28At33,
        normalDiagnostics: [
          normalDiagnostic(nearby33),
          normalDiagnostic(cinema33),
        ],
      }
      const recencyReports = allScenarios.map(recencyScenarioReport)
      const recencyScenarioFilter =
        process.env.PHASE5_RECENCY_SCENARIOS?.split(',')
          .map((name) => name.trim())
          .filter(Boolean) ?? []
      const filteredRecencyReports =
        recencyScenarioFilter.length > 0
          ? recencyReports.filter((scenario) =>
              recencyScenarioFilter.includes(scenario.name),
            )
          : recencyReports
      const originalC1Explanations = nearbyScenarios
        .filter((scenario) =>
          scenario.input.temperature === 26 || scenario.input.temperature === 28,
        )
        .map((scenario) => {
          const c1 = invariant(
            scenario.simulations.find((entry) => entry.key === 'C1'),
            'C1 explanation simulation missing',
          ).simulation
          const baseline = partitionRecommendations(
            scenario.results as RecommendationResult[],
          ).recentPurchases
          const baselineIds = new Set(baseline.map((result) => result.outfit.id))
          const c1Ids = new Set(
            c1.selections.map((selection) => selection.result.outfit.id),
          )
          const removedDates = baseline
            .filter((result) => !c1Ids.has(result.outfit.id))
            .map((result) => result.latestAcquiredOn)
            .filter((date): date is string => Boolean(date))
          const candidateExplanation = (result: RecommendationResult) => {
            const candidate = invariant(
              scenario.candidates.find(
                (entry) => entry.result.outfit.id === result.outfit.id,
              ),
              'C1 explanation candidate missing',
            )
            const decision = c1.decisions.find(
              (entry) =>
                entry.candidate.result.outfit.id === result.outfit.id,
            )
            return {
              outfit: outfitLabel(result.outfit),
              noveltyDate: result.latestAcquiredOn,
              noveltyAgeDays: result.latestAcquiredOn
                ? noveltyAgeDays(result.latestAcquiredOn, asOfDate)
                : null,
              wearCount: result.wearCount,
              overallRange: candidate.context.overall.expandedOkRange,
              state: candidate.context.state,
              exactMatchedWearLogCount:
                candidate.context.exactContext.distinctWearLogCount,
              exactMatchedObservedEndpoints:
                candidate.context.exactContext.relevantObservations.map(
                  (observation) => ({
                    wornOn: observation.wornOn,
                    endpoint: observation.endpoint,
                    temperature: observation.historicalTemperature,
                    feeling: observation.feeling,
                  }),
                ),
              c1Eligible: decision?.eligible ?? false,
              c1Selected: c1Ids.has(result.outfit.id),
              c1Reason: decision?.reason ?? 'not evaluated',
              c1NormalRank:
                scenario.integrationReport.movedFromRecentToNormal.find(
                  (entry) => entry.outfit === outfitLabel(result.outfit),
                )?.normalRank ?? null,
            }
          }
          return {
            scenario: scenario.name,
            input: scenario.input,
            originalW0Cards: baseline.map(candidateExplanation),
            removedByC1: baseline
              .filter((result) => !c1Ids.has(result.outfit.id))
              .map(candidateExplanation),
            c1Cards: c1.selections.map((selection) => {
              const result = selection.result
              return {
                ...candidateExplanation(result),
                sourceItem: invariant(
                  itemById.get(selection.sourceItemId),
                  'C1 source Item missing',
                ).name,
                sourceNoveltyDate: selection.noveltyDate,
                sourceNoveltyAgeDays: noveltyAgeDays(
                  selection.noveltyDate,
                  asOfDate,
                ),
                replacementForW0: !baselineIds.has(result.outfit.id),
                newerThanEveryRemovedCard:
                  removedDates.length > 0 &&
                  removedDates.every(
                    (date) => selection.noveltyDate.localeCompare(date) > 0,
                  ),
              }
            }),
          }
        })
      expect(output.readOnly).toBe(true)
      const countOnlyOutput = {
        readOnly: output.readOnly,
        homeOutputUnchanged: output.homeOutputUnchanged,
        scenarios: output.scenarios.map((scenario) => ({
          name: scenario.name,
          input: scenario.input,
          c1N3HomeIntegration: {
            ...scenario.c1N3HomeIntegration,
            featureOnRecent:
              scenario.c1N3HomeIntegration.featureOnRecent.map((entry) => ({
                outfit: entry.outfit,
                sourceItem: entry.sourceItem,
                noveltyDate: entry.noveltyDate,
                state: entry.evidence?.state ?? null,
                exactRange: entry.evidence?.exactContext.range ?? null,
                exactMatchedWearLogCount:
                  entry.evidence?.exactContext.matchedWearLogIds.length ?? 0,
                matchedObservedEndpoints:
                  entry.evidence?.exactContext.observations.map(
                    (observation) => ({
                      wornOn: observation.wornOn,
                      endpoint: observation.endpoint,
                      temperature: observation.temperature,
                      feeling: observation.feeling,
                    }),
                  ) ?? [],
                inferredReturnEndpointCount:
                  entry.evidence?.exactContext.inferredReturnEndpointCount ?? 0,
              })),
          },
          models: scenario.models.map((model) => ({
            model: model.model,
            eligible: model.eligibleOutfitCount,
            sources: model.distinctNoveltySourceItemCount,
            cards: model.cardCount,
            fewerThanThree: model.returnedFewerThanThree,
            stateDistribution: model.stateDistribution,
            topStates: model.cards.map((card) => card.state),
          })),
          disabledFallback: scenario.disabledFallback,
        })),
      }
      const reportOutput =
        process.env.PHASE5_W2_HOME_ONLY === 'true'
          ? {
              readOnly: true,
              homeOutputUnchanged: true,
              asOfDate,
              scenarios: allScenarios
                .filter(
                  (scenario) =>
                    recencyScenarioFilter.length === 0 ||
                    recencyScenarioFilter.includes(scenario.name),
                )
                .map((scenario) => ({
                  name: scenario.name,
                  input: scenario.input,
                  baselineRecent: scenario.currentHomeRecentPurchases,
                  ...scenario.w2IntegrationReport,
                })),
            }
          : process.env.PHASE5_RECENCY_WINDOW_ONLY === 'true'
          ? {
              readOnly: true,
              homeOutputUnchanged: true,
              asOfDate,
              scenarios: filteredRecencyReports,
              w2HomeIntegration: allScenarios
                .filter((scenario) =>
                  filteredRecencyReports.some(
                    (report) => report.name === scenario.name,
                  ),
                )
                .map((scenario) => ({
                  name: scenario.name,
                  input: scenario.input,
                  ...scenario.w2IntegrationReport,
                })),
              originalW0VersusC1: originalC1Explanations,
            }
          : process.env.PHASE5_CONTEXT_ELIGIBILITY_HOME_ONLY === 'true'
          ? {
              readOnly: output.readOnly,
              homeOutputUnchanged: output.homeOutputUnchanged,
              scenarios: countOnlyOutput.scenarios.map((scenario) => ({
                name: scenario.name,
                input: scenario.input,
                c1N3HomeIntegration: scenario.c1N3HomeIntegration,
              })),
            }
          : process.env.PHASE5_CONTEXT_ELIGIBILITY_COUNT_ONLY === 'true'
            ? countOnlyOutput
            : output
      process.stdout.write(
        `\nPHASE5_CONTEXT_ELIGIBILITY_PRIVATE_REPORT\n${JSON.stringify(reportOutput, null, 2)}\n`,
      )
    }, 120_000)
  },
)
