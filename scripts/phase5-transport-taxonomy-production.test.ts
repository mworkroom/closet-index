import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { recommendOutfits } from '../src/lib/recommendation'
import {
  compareTransportTaxonomyModels,
  TEST_TRANSPORT_BUCKETS,
  type TransportTaxonomyCandidate,
} from '../src/lib/transport-taxonomy-simulation.mjs'
import type {
  AppData,
  Item,
  Outfit,
  RecommendationInput,
  WearLog,
} from '../src/lib/types'

const RUN_PRODUCTION_COMPARISON =
  process.env.RUN_PHASE5_TRANSPORT_TAXONOMY_PRODUCTION === 'true'
const RUN_CLASSIFICATION_REPLAY =
  process.env.RUN_PHASE5_WALK_CLASSIFICATION_REPLAY === 'true'
const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'

type ReviewDecision =
  | 'walk_short'
  | 'walk_sustained'
  | 'ambiguous'
  | 'not relevant'

interface ReplayConfig {
  nearbyPlaceLabels: string[]
  decisions: Record<string, ReviewDecision>
}

function invariant<T>(value: T, message: string): NonNullable<T> {
  if (value === null || value === undefined || value === '') throw new Error(message)
  return value as NonNullable<T>
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function parseReplayConfig(value: unknown): ReplayConfig {
  assertCondition(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Replay config must be an object.',
  )
  const parsed = value as {
    nearbyPlaceLabels?: unknown
    nearbyPlaceLabel?: unknown
    decisions?: unknown
  }
  const rawLabels = Array.isArray(parsed.nearbyPlaceLabels)
    ? parsed.nearbyPlaceLabels
    : typeof parsed.nearbyPlaceLabel === 'string'
      ? [parsed.nearbyPlaceLabel]
      : []
  const nearbyPlaceLabels = rawLabels.map((label) => {
    assertCondition(
      typeof label === 'string' && label.trim().length > 0,
      'Every nearbyPlaceLabels entry must be a non-empty string.',
    )
    return label.trim()
  })
  assertCondition(
    nearbyPlaceLabels.length > 0,
    'nearbyPlaceLabels must not be empty.',
  )
  assertCondition(
    new Set(nearbyPlaceLabels).size === nearbyPlaceLabels.length,
    'nearbyPlaceLabels must not contain duplicates.',
  )
  assertCondition(
    parsed.decisions && typeof parsed.decisions === 'object' && !Array.isArray(parsed.decisions),
    'decisions must be an object keyed by Wear Log ID.',
  )
  const allowed = new Set<ReviewDecision>([
    'walk_short',
    'walk_sustained',
    'ambiguous',
    'not relevant',
  ])
  const decisions = Object.fromEntries(
    Object.entries(parsed.decisions as Record<string, unknown>).map(
      ([wearLogId, decision]) => {
        assertCondition(
          typeof decision === 'string' && allowed.has(decision as ReviewDecision),
          `Invalid decision for Wear Log ${wearLogId}.`,
        )
        return [wearLogId, decision as ReviewDecision]
      },
    ),
  )
  return { nearbyPlaceLabels, decisions }
}

function loadReplayConfig(): ReplayConfig | null {
  if (!RUN_CLASSIFICATION_REPLAY) return null
  const configPath = invariant(
    process.env.PHASE5_WALK_CLASSIFICATION_FILE,
    'PHASE5_WALK_CLASSIFICATION_FILE is required for replay.',
  )
  return parseReplayConfig(JSON.parse(readFileSync(resolve(configPath), 'utf8')))
}

describe('walk classification replay config', () => {
  it('accepts multiple nearby Place labels without merging their contexts', () => {
    expect(
      parseReplayConfig({
        nearbyPlaceLabels: ['nearby-place-a', 'nearby-place-b'],
        decisions: {
          'wear-log-short': 'walk_short',
          'wear-log-sustained': 'walk_sustained',
        },
      }),
    ).toEqual({
      nearbyPlaceLabels: ['nearby-place-a', 'nearby-place-b'],
      decisions: {
        'wear-log-short': 'walk_short',
        'wear-log-sustained': 'walk_sustained',
      },
    })
  })

  it('rejects duplicate nearby Place labels', () => {
    expect(() =>
      parseReplayConfig({
        nearbyPlaceLabels: ['nearby-place', 'nearby-place'],
        decisions: {},
      }),
    ).toThrow('nearbyPlaceLabels must not contain duplicates.')
  })
})

describe.runIf(RUN_PRODUCTION_COMPARISON || RUN_CLASSIFICATION_REPLAY)(
  'read-only production Transport taxonomy comparison',
  () => {
    it('compares baseline, unsplit Policy B, and strict unclassified split models', async () => {
      const replayConfig = loadReplayConfig()
      const envFile = resolve('.env.supabase.local')
      if (existsSync(envFile)) process.loadEnvFile(envFile)
      const supabaseUrl = invariant(
        process.env.SUPABASE_URL,
        'SUPABASE_URL is required.',
      ).replace(/\/$/, '')
      assertCondition(
        new URL(supabaseUrl).hostname === `${EXPECTED_PROJECT_REF}.supabase.co`,
        `Audit target must be ${EXPECTED_PROJECT_REF}.`,
      )
      const secretKey = invariant(
        process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
        'SUPABASE_SECRET_KEY is required.',
      )
      const workspaceId = invariant(
        process.env.IMPORT_WORKSPACE_ID,
        'IMPORT_WORKSPACE_ID is required.',
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

      const [itemRows, outfitRows, linkRows, wearLogRows, placeRows, transportRows] =
        await Promise.all([
          collectAll(
            'closet_items',
            'id,name,category,semantic_color,seasons,retired,rain_ok,long_walk_ok,memo,acquired_on',
          ),
          collectAll('closet_outfits', 'id,display_name,rating,archived_at'),
          collectAll('closet_outfit_items', 'outfit_id,item_id,sort_order'),
          collectAll(
            'closet_wear_logs',
            'id,outfit_id,worn_on,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back,rain_condition,long_walk_condition,place_id,transport_mode_id,memo,temperature_source,weather_location_id,weather_issued_at,weather_overridden,submission_token,created_at',
          ),
          collectAll('closet_places', 'id,name'),
          collectAll('closet_transport_modes', 'id,name'),
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
      }))
      const itemNameById = new Map(items.map((item) => [item.id, item.name]))
      const linksByOutfit = new Map<string, Array<{ itemId: string; sortOrder: number }>>()
      for (const row of linkRows) {
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
              left.sortOrder - right.sortOrder || left.itemId.localeCompare(right.itemId),
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
        longWalkCondition: row.long_walk_condition as WearLog['longWalkCondition'],
        placeId: (row.place_id as string | null) ?? null,
        transportModeId: (row.transport_mode_id as string | null) ?? null,
        memo: (row.memo as string | null) ?? null,
        temperatureSource: row.temperature_source as WearLog['temperatureSource'],
        weatherLocationId: (row.weather_location_id as string | null) ?? null,
        weatherIssuedAt: (row.weather_issued_at as string | null) ?? null,
        weatherOverridden: Boolean(row.weather_overridden),
        submissionToken: row.submission_token as string,
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
      const data: AppData = { items, outfits, wearLogs, places, transportModes }
      const outfitAliasById = new Map(
        [...outfits]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((outfit, index) => [
            outfit.id,
            `outfit-${String(index + 1).padStart(3, '0')}`,
          ]),
      )
      const outfitIdByAlias = new Map(
        [...outfitAliasById].map(([outfitId, alias]) => [alias, outfitId]),
      )
      const labelForOutfitId = (outfitId: string) => {
        const outfit = invariant(
          outfits.find((entry) => entry.id === outfitId),
          `Outfit ${outfitId} was not found.`,
        )
        return (
          outfit.displayName?.trim() ||
          outfit.itemIds
            .map((itemId) => itemNameById.get(itemId))
            .filter(Boolean)
            .join(' + ') ||
          '이름 없는 Outfit'
        )
      }
      const historicalWalkModeId = invariant(
        transportModes.find((entry) => /^(walk|도보)$/iu.test(entry.name.trim()))?.id,
        'Historical Walk mode was not found.',
      )
      const carModeId = invariant(
        transportModes.find((entry) => /^(car|차)$/iu.test(entry.name.trim()))?.id,
        'Car mode was not found.',
      )
      const starbucksPlaces = places
        .filter((place) => /(starbucks|스타벅스)/iu.test(place.name))
        .sort((left, right) => left.id.localeCompare(right.id))
      const cgvPlaces = places
        .filter((place) => /cgv/iu.test(place.name))
        .sort((left, right) => left.id.localeCompare(right.id))
      const summerCgvCounts = new Map(
        cgvPlaces.map((place) => [
          place.id,
          wearLogs.filter(
            (log) =>
              log.placeId === place.id &&
              [6, 7, 8].includes(Number(log.wornOn.slice(5, 7))),
          ).length,
        ]),
      )
      const primaryCgv = invariant(
        [...cgvPlaces].sort(
          (left, right) =>
            (summerCgvCounts.get(right.id) ?? 0) -
              (summerCgvCounts.get(left.id) ?? 0) ||
            left.id.localeCompare(right.id),
        )[0],
        'No CGV Place was found.',
      )
      const selectedNearbyPlaces = replayConfig
        ? replayConfig.nearbyPlaceLabels.map((label) =>
            invariant(
              places.find((place) => place.name === label),
              `The reviewed nearby Place label was not found: ${label}`,
            ),
          )
        : []
      if (
        selectedNearbyPlaces.some(
          (selectedPlace) =>
            !starbucksPlaces.some((place) => place.id === selectedPlace.id),
        )
      ) {
        throw new Error('Every reviewed nearby Place must be an audited cafe candidate.')
      }
      const replayEligibleWearLogIds = new Set(
        wearLogs
          .filter(
            (log) =>
              starbucksPlaces.some((place) => place.id === log.placeId) &&
              log.transportModeId === historicalWalkModeId &&
              ([6, 7, 8].includes(Number(log.wornOn.slice(5, 7))) ||
                (log.tempOut !== null && log.tempOut >= 28)),
          )
          .map((log) => log.id),
      )
      const reviewSheetWearLogIds = new Set(
        wearLogs
          .filter(
            (log) =>
              starbucksPlaces.some((place) => place.id === log.placeId) &&
              log.transportModeId === historicalWalkModeId &&
              ([6, 7, 8].includes(Number(log.wornOn.slice(5, 7))) ||
                (log.tempOut !== null && log.tempOut >= 28)),
          )
          .map((log) => log.id),
      )
      for (const wearLogId of Object.keys(replayConfig?.decisions ?? {})) {
        assertCondition(
          reviewSheetWearLogIds.has(wearLogId),
          `Wear Log ${wearLogId} is not in the audited classification sheet.`,
        )
      }
      if (replayConfig) {
        assertCondition(
          Object.keys(replayConfig.decisions).length === reviewSheetWearLogIds.size &&
            [...reviewSheetWearLogIds].every(
              (wearLogId) => replayConfig.decisions[wearLogId],
            ),
          'The replay file must contain one decision for every review-sheet row.',
        )
        const selectedNearbyPlaceIds = new Set(
          selectedNearbyPlaces.map((place) => place.id),
        )
        for (const [wearLogId, decision] of Object.entries(replayConfig.decisions)) {
          const reviewedLog = invariant(
            wearLogs.find((log) => log.id === wearLogId),
            `Wear Log ${wearLogId} was not found.`,
          )
          if (selectedNearbyPlaceIds.has(invariant(reviewedLog.placeId, 'Reviewed Place is missing.'))) {
            assertCondition(
              decision === 'walk_short',
              `Wear Log ${wearLogId} belongs to a selected nearby Place and must be walk_short.`,
            )
          }
        }
      }
      const outfitAlias = (outfitId: string) =>
        invariant(outfitAliasById.get(outfitId), 'Outfit alias was not found.')
      const baseInput = {
        tempBack: null,
        rainCondition: 'no' as const,
        longWalkCondition: 'no' as const,
      }
      type Scenario = {
        key: string
        input: RecommendationInput
        splitTransportModeId: (typeof TEST_TRANSPORT_BUCKETS)[keyof typeof TEST_TRANSPORT_BUCKETS] | null
      }
      const defaultScenarios: Scenario[] = [
        ...starbucksPlaces.map((place, index) => ({
          key: `nearby-starbucks-${index + 1}`,
          input: {
            ...baseInput,
            tempOut: 33,
            placeId: place.id,
            transportModeId: historicalWalkModeId,
          },
          splitTransportModeId: TEST_TRANSPORT_BUCKETS.walkShort,
        })),
        {
          key: 'cgv-car-33',
          input: {
            ...baseInput,
            tempOut: 33,
            placeId: primaryCgv.id,
            transportModeId: carModeId,
          },
          splitTransportModeId: TEST_TRANSPORT_BUCKETS.car,
        },
        {
          key: 'sustained-walk-place-null-30',
          input: {
            ...baseInput,
            tempOut: 30,
            placeId: null,
            transportModeId: historicalWalkModeId,
          },
          splitTransportModeId: TEST_TRANSPORT_BUCKETS.walkSustained,
        },
        {
          key: 'transport-null-33',
          input: {
            ...baseInput,
            tempOut: 33,
            placeId: primaryCgv.id,
            transportModeId: null,
          },
          splitTransportModeId: null,
        },
      ]
      const nearbyPlaceCarEvidence = selectedNearbyPlaces.map((place) => ({
        place,
        hasEvidence: wearLogs.some(
          (log) => log.placeId === place.id && log.transportModeId === carModeId,
        ),
      }))
      const replayScenarios: Scenario[] = replayConfig
        ? [
            ...selectedNearbyPlaces.flatMap((place, placeIndex) => [
              ...[33, 30, 28].map((tempOut) => ({
                key: `actual-nearby-${placeIndex + 1}-walk-short-${tempOut}`,
                input: {
                  ...baseInput,
                  tempOut,
                  placeId: place.id,
                  transportModeId: historicalWalkModeId,
                },
                splitTransportModeId: TEST_TRANSPORT_BUCKETS.walkShort,
              })),
              ...(nearbyPlaceCarEvidence[placeIndex].hasEvidence
                ? [
                    {
                      key: `actual-nearby-${placeIndex + 1}-car-33`,
                      input: {
                        ...baseInput,
                        tempOut: 33,
                        placeId: place.id,
                        transportModeId: carModeId,
                      },
                      splitTransportModeId: TEST_TRANSPORT_BUCKETS.car,
                    },
                  ]
                : []),
            ]),
            {
              key: 'primary-cinema-car-33',
              input: {
                ...baseInput,
                tempOut: 33,
                placeId: primaryCgv.id,
                transportModeId: carModeId,
              },
              splitTransportModeId: TEST_TRANSPORT_BUCKETS.car,
            },
          ]
        : []
      const scenarios = replayConfig ? replayScenarios : defaultScenarios
      const replayDecisions = replayConfig?.decisions ?? {}

      const report = scenarios.map((scenario) => {
        const baseline = recommendOutfits(data, scenario.input)
        const currentPolicyB = recommendOutfits(data, scenario.input, {
          enableTransportThermalPolicyB: true,
        })
        const candidates: TransportTaxonomyCandidate[] = baseline.map(
          (result, baselineOrder) => ({
            id: result.outfit.id,
            level: result.level,
            baselineOrder,
            logs: wearLogs.filter((log) => log.outfitId === result.outfit.id),
            warnings: result.warnings,
          }),
        )
        const comparison = compareTransportTaxonomyModels({
          candidates,
          input: scenario.input,
          splitTransportModeId: scenario.splitTransportModeId,
          historicalWalkModeId,
          carModeId,
          walkClassificationByWearLogId: replayDecisions,
        })

        expect(comparison.model0.fullOrder).toEqual(
          baseline.map((entry) => entry.outfit.id),
        )
        expect(comparison.model1.fullOrder).toEqual(
          currentPolicyB.map((entry) => entry.outfit.id),
        )
        if (scenario.key === 'cgv-car-33') {
          expect(comparison.model2.fullOrder).toEqual(comparison.model1.fullOrder)
        }
        if (scenario.key === 'transport-null-33') {
          expect(comparison.model2.fullOrder).toEqual(comparison.model0.fullOrder)
        }

        const compactModel = (model: typeof comparison.model0) => ({
          topSix: model.topSixOrder.map(outfitAlias),
          directlyAdjustedOutfitCount: model.directlyAdjustedOutfitCount,
          topSixEvidence: model.topSixOrder.map((id) => {
            const entry = invariant(
              model.candidates.find((candidate) => candidate.id === id),
              `Evidence for ${id} was not found.`,
            )
            return {
              outfit: outfitAlias(id),
              currentTransportCount: entry.currentTransportDistinctWearLogCount,
              exactContextCount: entry.exactContextDistinctWearLogCount,
              overallRange: entry.overallRange,
              currentTransportRange: entry.currentTransportRange,
              borrowedOnly: entry.borrowedOnly,
              status: entry.status,
              confidence: entry.confidence,
              inferredReturnAffected: entry.inferredReturnAffected,
            }
          }),
          inferredReturnAffectedOutfitCount: model.candidates.filter(
            (entry) => entry.inferredReturnAffected,
          ).length,
        })
        const baselineRankById = new Map(
          comparison.model0.fullOrder.map((id, index) => [id, index + 1]),
        )
        const splitRankById = new Map(
          comparison.model2.fullOrder.map((id, index) => [id, index + 1]),
        )
        const movedTopSixIds = [
          ...new Set([
            ...comparison.model0.topSixOrder,
            ...comparison.model2.topSixOrder,
          ]),
        ].filter(
          (id) => baselineRankById.get(id) !== splitRankById.get(id),
        )

        return {
          key: scenario.key,
          input: {
            tempOut: scenario.input.tempOut,
            place:
              scenario.input.placeId === null
                ? null
                : scenario.key.startsWith('nearby-starbucks') ||
                    scenario.key.startsWith('actual-nearby')
                  ? replayConfig
                    ? `actual-nearby-place-${selectedNearbyPlaces.findIndex(
                        (place) => place.id === scenario.input.placeId,
                      ) + 1}`
                    : `nearby-place-${scenario.key.at(-1)}`
                  : 'cinema-place',
            transport:
              scenario.input.transportModeId === null
                ? null
                : scenario.input.transportModeId === historicalWalkModeId
                  ? 'historical-walk'
                  : 'car',
            splitTransport: scenario.splitTransportModeId,
          },
          strictSplitAssumption:
            replayConfig
              ? 'Only explicitly confirmed Wear Log IDs are remapped; all other historical Walk rows remain walk_unclassified.'
              : 'All historical Walk rows remain walk_unclassified until manual review.',
          model0: compactModel(comparison.model0),
          model1: compactModel(comparison.model1),
          model2: compactModel(comparison.model2),
          splitMovement: {
            changedPositionCount: comparison.model0.fullOrder.filter(
              (id, index) => comparison.model2.fullOrder[index] !== id,
            ).length,
            movedTopSix: movedTopSixIds.map((id) => {
              const oldRank = invariant(baselineRankById.get(id), 'Old rank is missing.')
              const newRank = invariant(splitRankById.get(id), 'New rank is missing.')
              const evidence = invariant(
                comparison.model2.candidates.find((candidate) => candidate.id === id),
                `Split evidence for ${id} was not found.`,
              )
              return {
                outfit: outfitAlias(id),
                oldRank,
                newRank,
                direction: newRank < oldRank ? 'up' : 'down',
                rankDifference: Math.abs(newRank - oldRank),
                reason: evidence.borrowedOnly
                  ? `${evidence.confidence} borrowed-only`
                  : evidence.status,
                currentTransportCount:
                  evidence.currentTransportDistinctWearLogCount,
                exactContextCount: evidence.exactContextDistinctWearLogCount,
                overallRange: evidence.overallRange,
                currentTransportRange: evidence.currentTransportRange,
                inferredReturnAffected: evidence.inferredReturnAffected,
              }
            }),
          },
        }
      })

      expect(starbucksPlaces.length).toBeGreaterThan(0)
      const auditEnvelope = {
          queryStrategy: { fixedSelectStreams: 6, writes: false },
          replayReview: replayConfig
            ? {
                eligibleRowCount: replayEligibleWearLogIds.size,
                reviewSheetRowCount: reviewSheetWearLogIds.size,
                returnedDecisionCount: Object.keys(replayConfig.decisions).length,
                confirmedWalkShortCount: Object.values(replayDecisions).filter(
                  (decision) => decision === 'walk_short',
                ).length,
                confirmedWalkSustainedCount: Object.values(replayDecisions).filter(
                  (decision) => decision === 'walk_sustained',
                ).length,
                unclassifiedDecisionCount: Object.values(replayDecisions).filter(
                  (decision) =>
                    decision === 'ambiguous' || decision === 'not relevant',
                ).length,
                nearbyPlaceCount: selectedNearbyPlaces.length,
                nearbyCarScenarioCount: nearbyPlaceCarEvidence.filter(
                  (entry) => entry.hasEvidence,
                ).length,
                skippedNearbyCarScenarioCount: nearbyPlaceCarEvidence.filter(
                  (entry) => !entry.hasEvidence,
                ).length,
              }
            : null,
          report,
        }
      if (replayConfig) {
        const labelForAlias = (alias: string) =>
          labelForOutfitId(
            invariant(outfitIdByAlias.get(alias), `Outfit alias ${alias} was not found.`),
          )
        console.log(
          `PHASE5_WALK_CLASSIFICATION_REPLAY_PRIVATE=${JSON.stringify({
            queryStrategy: auditEnvelope.queryStrategy,
            replayReview: auditEnvelope.replayReview,
            report: report.map((scenario) => ({
              key: scenario.key,
              input: {
                ...scenario.input,
                place: scenario.input.place?.startsWith('actual-nearby-place-')
                  ? replayConfig.nearbyPlaceLabels[
                      Number(scenario.input.place.at(-1)) - 1
                    ]
                  : scenario.input.place,
              },
              baselineTopSix: scenario.model0.topSix.map(labelForAlias),
              unsplitPolicyBTopSix: scenario.model1.topSix.map(labelForAlias),
              splitModelTopSix: scenario.model2.topSixEvidence.map((entry) => ({
                label: labelForAlias(entry.outfit),
                currentShortWalkCount: entry.currentTransportCount,
                exactContextCount: entry.exactContextCount,
                overallRange: entry.overallRange,
                shortWalkRange: entry.currentTransportRange,
                borrowedOnly: entry.borrowedOnly,
                status: entry.status,
                confidence: entry.confidence,
                inferredReturnAffected: entry.inferredReturnAffected,
              })),
              splitMovement: {
                changedPositionCount: scenario.splitMovement.changedPositionCount,
                inferredReturnAffectedOutfitCount:
                  scenario.model2.inferredReturnAffectedOutfitCount,
                movedTopSix: scenario.splitMovement.movedTopSix.map((entry) => ({
                  label: labelForAlias(entry.outfit),
                  oldRank: entry.oldRank,
                  newRank: entry.newRank,
                  direction: entry.direction,
                  rankDifference: entry.rankDifference,
                  reason: entry.reason,
                  currentShortWalkCount: entry.currentTransportCount,
                  exactContextCount: entry.exactContextCount,
                  overallRange: entry.overallRange,
                  shortWalkRange: entry.currentTransportRange,
                  inferredReturnAffected: entry.inferredReturnAffected,
                })),
              },
            })),
          })}`,
        )
      } else {
        console.log(
          `PHASE5_TRANSPORT_TAXONOMY_ANONYMOUS_REPORT=${JSON.stringify(auditEnvelope)}`,
        )
      }
    }, 60_000)
  },
)
