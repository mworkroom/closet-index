import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  calculateDirectEvidence,
  simulateDirectEvidencePartitions,
  type DirectEvidence,
  type DirectEvidenceMovementCap,
  type DirectEvidencePolicyVariant,
} from '../src/lib/direct-evidence-policy'
import { rankHomeRecommendationsWithDirectEvidenceE2 } from '../src/lib/direct-evidence-home-ranking'
import {
  partitionRecommendations,
  recommendOutfits,
} from '../src/lib/recommendation'
import type {
  AppData,
  Item,
  Outfit,
  RecommendationInput,
  RecommendationResult,
  WearLog,
} from '../src/lib/types'

const RUN_PRODUCTION_COMPARISON =
  process.env.RUN_PHASE5_DIRECT_EVIDENCE_PRODUCTION === 'true'
const PAIR_REPORT_ONLY =
  process.env.PHASE5_DIRECT_EVIDENCE_REPORT_MODE === 'pairs'
const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'
const movementCaps: DirectEvidenceMovementCap[] = [1, 3, 5]

function invariant<T>(value: T, message: string): NonNullable<T> {
  if (value === null || value === undefined || value === '') {
    throw new Error(message)
  }
  return value as NonNullable<T>
}

function outcomeFromAudit(evidence: DirectEvidence) {
  const observations = evidence.exactContext.auditObservations
  const hasSupport = observations.some((observation) => observation.feeling === 'ok')
  const hasIssue = observations.some(
    (observation) =>
      observation.feeling === 'cold' || observation.feeling === 'hot',
  )
  if (hasSupport && hasIssue) return 'mixed'
  if (hasSupport) return 'direct_support'
  if (hasIssue) return 'direct_issue'
  return 'unknown'
}

describe.runIf(RUN_PRODUCTION_COMPARISON)(
  'read-only production Policy E direct-evidence comparison',
  () => {
    it('compares E0, E1, and E2 inside frozen baseline groups', async () => {
      const envFile = resolve('.env.supabase.local')
      if (existsSync(envFile)) process.loadEnvFile(envFile)

      const supabaseUrl = invariant(
        process.env.SUPABASE_URL,
        'SUPABASE_URL이 필요합니다.',
      ).replace(/\/$/, '')
      expect(new URL(supabaseUrl).hostname).toBe(
        `${EXPECTED_PROJECT_REF}.supabase.co`,
      )
      const secretKey = invariant(
        process.env.SUPABASE_SECRET_KEY ??
          process.env.SUPABASE_SERVICE_ROLE_KEY,
        'SUPABASE_SECRET_KEY가 필요합니다.',
      )
      const workspaceId = invariant(
        process.env.IMPORT_WORKSPACE_ID,
        'IMPORT_WORKSPACE_ID가 필요합니다.',
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
      ] = await Promise.all([
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
        weatherIssuedAt:
          (row.weather_issued_at as string | null) ?? null,
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
      const data: AppData = {
        items,
        outfits,
        wearLogs,
        places,
        transportModes,
      }
      const transportId = (name: string) =>
        invariant(
          transportModes.find((transport) => transport.name === name)?.id,
          `Transport ${name}을 찾을 수 없습니다.`,
        )
      const walkShortId = transportId('도보 · 근거리')
      const walkSustainedId = transportId('도보 · 지속')
      const carId = transportId('차')
      const busId = transportId('버스')
      const placesByTransportEvidence = (transportModeId: string) =>
        places
          .map((place) => ({
            place,
            count: wearLogs.filter(
              (log) =>
                log.placeId === place.id &&
                log.transportModeId === transportModeId,
            ).length,
          }))
          .filter((entry) => entry.count > 0)
          .sort(
            (left, right) =>
              right.count - left.count ||
              left.place.id.localeCompare(right.place.id),
          )
      const shortPlaces = placesByTransportEvidence(walkShortId)
      const sustainedPlaces = placesByTransportEvidence(walkSustainedId)
      const primaryShortPlace = invariant(
        shortPlaces[0]?.place,
        '근거리 도보 근거가 있는 Place가 필요합니다.',
      )
      const secondaryShortPlace = invariant(
        shortPlaces[1]?.place,
        '두 번째 근거리 도보 Place가 필요합니다.',
      )
      const primarySustainedPlace = invariant(
        sustainedPlaces.find((entry) =>
          /(starbucks|스타벅스)/iu.test(entry.place.name),
        )?.place,
        '지속 도보 근거가 있는 cafe Place가 필요합니다.',
      )
      const primaryCinemaPlace = invariant(
        places
          .filter((place) => /cgv/iu.test(place.name))
          .map((place) => ({
            place,
            summerCarCount: wearLogs.filter(
              (log) =>
                log.placeId === place.id &&
                log.transportModeId === carId &&
                [6, 7, 8].includes(Number(log.wornOn.slice(5, 7))),
            ).length,
          }))
          .sort(
            (left, right) =>
              right.summerCarCount - left.summerCarCount ||
              left.place.id.localeCompare(right.place.id),
          )[0]?.place,
        'Car 근거 비교에 사용할 cinema Place가 필요합니다.',
      )
      const labelForOutfit = (outfit: Outfit) =>
        outfit.displayName?.trim() ||
        outfit.itemIds
          .map((id) => itemNameById.get(id))
          .filter(Boolean)
          .join(' + ') ||
        '이름 없는 Outfit'
      const labelForResult = (result: RecommendationResult) =>
        labelForOutfit(result.outfit)
      const baseInput = {
        tempBack: null,
        rainCondition: 'no' as const,
        longWalkCondition: 'no' as const,
      }
      const matrix: Array<{
        key: string
        input: RecommendationInput
      }> = [
        {
          key: 'nearby-a-short-33',
          input: {
            ...baseInput,
            tempOut: 33,
            placeId: primaryShortPlace.id,
            transportModeId: walkShortId,
          },
        },
        {
          key: 'nearby-b-short-33',
          input: {
            ...baseInput,
            tempOut: 33,
            placeId: secondaryShortPlace.id,
            transportModeId: walkShortId,
          },
        },
        {
          key: 'nearby-a-short-30',
          input: {
            ...baseInput,
            tempOut: 30,
            placeId: primaryShortPlace.id,
            transportModeId: walkShortId,
          },
        },
        {
          key: 'nearby-a-short-28',
          input: {
            ...baseInput,
            tempOut: 28,
            placeId: primaryShortPlace.id,
            transportModeId: walkShortId,
          },
        },
        {
          key: 'sustained-place-30',
          input: {
            ...baseInput,
            tempOut: 30,
            placeId: primarySustainedPlace.id,
            transportModeId: walkSustainedId,
          },
        },
        {
          key: 'evidence-zero-26',
          input: {
            ...baseInput,
            tempOut: 26,
            placeId: primaryCinemaPlace.id,
            transportModeId: busId,
          },
        },
        {
          key: 'winter-car-minus-8',
          input: {
            ...baseInput,
            tempOut: -8,
            placeId: primaryCinemaPlace.id,
            transportModeId: carId,
          },
        },
        {
          key: 'place-null-short-26',
          input: {
            ...baseInput,
            tempOut: 26,
            placeId: null,
            transportModeId: walkShortId,
          },
        },
        {
          key: 'transport-null-26',
          input: {
            ...baseInput,
            tempOut: 26,
            placeId: primaryCinemaPlace.id,
            transportModeId: null,
          },
        },
        {
          key: 'cinema-car-33',
          input: {
            ...baseInput,
            tempOut: 33,
            placeId: primaryCinemaPlace.id,
            transportModeId: carId,
          },
        },
      ]

      const report = matrix.map(({ key, input }) => {
        const baseline = recommendOutfits(data, input)
        const groups = partitionRecommendations(baseline)
        const groupedResults = [
          ...groups.recentPurchases,
          ...groups.recommendations,
          ...groups.trialRecommendations,
        ]
        const evidenceByOutfitId = new Map(
          groupedResults.map((result) => [
            result.outfit.id,
            calculateDirectEvidence(
              wearLogs.filter((log) => log.outfitId === result.outfit.id),
              input,
            ),
          ]),
        )
        const inventory = [...evidenceByOutfitId.values()]
        const outcomeCounts = {
          directSupport: inventory.filter(
            (evidence) =>
              evidence.exactContext.outcome === 'direct_support',
          ).length,
          directIssue: inventory.filter(
            (evidence) => evidence.exactContext.outcome === 'direct_issue',
          ).length,
          mixed: inventory.filter(
            (evidence) => evidence.exactContext.outcome === 'mixed',
          ).length,
          unknown: inventory.filter(
            (evidence) => evidence.exactContext.outcome === 'unknown',
          ).length,
        }
        const confidenceCounts = {
          observedOnce: inventory.filter(
            (evidence) =>
              evidence.exactContext.confidence === 'observed-once',
          ).length,
          repeated: inventory.filter(
            (evidence) => evidence.exactContext.confidence === 'repeated',
          ).length,
        }
        const inferredReturnSensitivity = {
          candidatesWithAuditOnlyInferredMatch: inventory.filter(
            (evidence) =>
              evidence.exactContext.inferredReturnAuditObservationCount > 0,
          ).length,
          hypotheticalOutcomeChangesIfInferredWereUsed: inventory.filter(
            (evidence) =>
              outcomeFromAudit(evidence) !== evidence.exactContext.outcome,
          ).length,
          actualRankingAdjustmentsFromInferred: 0,
        }
        const topSix = (values: RecommendationResult[]) =>
          values.slice(0, 6).map(labelForResult)
        const baselineTopSix = {
          recentPurchases: topSix(groups.recentPurchases),
          recommendations: topSix(groups.recommendations),
          trialRecommendations: topSix(groups.trialRecommendations),
        }
        const variants: Array<{
          variant: DirectEvidencePolicyVariant
          cap: DirectEvidenceMovementCap
        }> = [
          { variant: 'E0', cap: 1 },
          ...movementCaps.map((cap) => ({ variant: 'E1' as const, cap })),
          ...movementCaps.map((cap) => ({ variant: 'E2' as const, cap })),
        ]
        const simulations = variants.map(({ variant, cap }) => {
          const simulation = simulateDirectEvidencePartitions(
            groups,
            evidenceByOutfitId,
            variant,
            cap,
          )
          expect(simulation.groupMembershipChanges).toBe(0)
          expect(simulation.maximumIndividualMovement).toBeLessThanOrEqual(cap)
          for (const groupName of [
            'recentPurchases',
            'recommendations',
            'trialRecommendations',
          ] as const) {
            expect(
              new Set(
                simulation.groups[groupName].map((result) => result.outfit.id),
              ),
            ).toEqual(
              new Set(groups[groupName].map((result) => result.outfit.id)),
            )
          }
          return {
            variant,
            cap,
            topSix: {
              recentPurchases: topSix(simulation.groups.recentPurchases),
              recommendations: topSix(simulation.groups.recommendations),
              trialRecommendations: topSix(
                simulation.groups.trialRecommendations,
              ),
            },
            directlyMovedOutfitCount: simulation.directlyMovedOutfitCount,
            totalChangedPositions: simulation.totalChangedPositions,
            maximumIndividualMovement:
              simulation.maximumIndividualMovement,
            groupMembershipChanges: simulation.groupMembershipChanges,
          }
        })

        expect(simulations.find((entry) => entry.variant === 'E0')).toMatchObject({
          directlyMovedOutfitCount: 0,
          totalChangedPositions: 0,
          groupMembershipChanges: 0,
        })

        const selectedHomeCandidate = rankHomeRecommendationsWithDirectEvidenceE2(
          data,
          input,
          groups,
          true,
        )
        const selectedSimulation = invariant(
          simulations.find(
            (entry) => entry.variant === 'E2' && entry.cap === 1,
          ),
          'E2/cap 1 simulation이 필요합니다.',
        )
        expect({
          recentPurchases: topSix(
            selectedHomeCandidate.groups.recentPurchases,
          ),
          recommendations: topSix(
            selectedHomeCandidate.groups.recommendations,
          ),
          trialRecommendations: topSix(
            selectedHomeCandidate.groups.trialRecommendations,
          ),
        }).toEqual(selectedSimulation.topSix)

        return {
          key,
          input: {
            tempOut: input.tempOut,
            tempBack: input.tempBack,
            place:
              places.find((place) => place.id === input.placeId)?.name ?? null,
            transport:
              transportModes.find(
                (transport) => transport.id === input.transportModeId,
              )?.name ?? null,
          },
          candidateCount: groupedResults.length,
          outcomeCounts,
          confidenceCounts,
          inferredReturnSensitivity,
          baselineTopSix,
          simulations,
          movedPairExplanations: selectedHomeCandidate.movedPairs,
        }
      })

      const totals = report.reduce(
        (summary, scenario) => ({
          directSupport:
            summary.directSupport + scenario.outcomeCounts.directSupport,
          directIssue: summary.directIssue + scenario.outcomeCounts.directIssue,
          mixed: summary.mixed + scenario.outcomeCounts.mixed,
          unknown: summary.unknown + scenario.outcomeCounts.unknown,
          observedOnce:
            summary.observedOnce + scenario.confidenceCounts.observedOnce,
          repeated: summary.repeated + scenario.confidenceCounts.repeated,
        }),
        {
          directSupport: 0,
          directIssue: 0,
          mixed: 0,
          unknown: 0,
          observedOnce: 0,
          repeated: 0,
        },
      )
      const movementTotals = [
        { variant: 'E0' as const, cap: 1 as const },
        ...movementCaps.map((cap) => ({ variant: 'E1' as const, cap })),
        ...movementCaps.map((cap) => ({ variant: 'E2' as const, cap })),
      ].map(({ variant, cap }) => {
        const simulations = report.map((scenario) =>
          invariant(
            scenario.simulations.find(
              (simulation) =>
                simulation.variant === variant && simulation.cap === cap,
            ),
            `${variant}/${cap} simulation이 필요합니다.`,
          ),
        )
        return {
          variant,
          cap,
          directlyMovedOutfitCount: simulations.reduce(
            (sum, simulation) =>
              sum + simulation.directlyMovedOutfitCount,
            0,
          ),
          totalChangedPositions: simulations.reduce(
            (sum, simulation) => sum + simulation.totalChangedPositions,
            0,
          ),
          maximumIndividualMovement: Math.max(
            0,
            ...simulations.map(
              (simulation) => simulation.maximumIndividualMovement,
            ),
          ),
          groupMembershipChanges: simulations.reduce(
            (sum, simulation) => sum + simulation.groupMembershipChanges,
            0,
          ),
        }
      })

      expect(
        report.find((scenario) => scenario.key === 'place-null-short-26')
          ?.simulations,
      ).toSatisfy((simulations: (typeof report)[number]['simulations']) =>
        simulations.every(
          (simulation) => simulation.totalChangedPositions === 0,
        ),
      )
      expect(
        report.find((scenario) => scenario.key === 'transport-null-26')
          ?.simulations,
      ).toSatisfy((simulations: (typeof report)[number]['simulations']) =>
        simulations.every(
          (simulation) => simulation.totalChangedPositions === 0,
        ),
      )
      expect(
        report.every((scenario) =>
          scenario.simulations.every(
            (simulation) => simulation.groupMembershipChanges === 0,
          ),
        ),
      ).toBe(true)

      const compactReport = report.map((scenario) => ({
        key: scenario.key,
        input: scenario.input,
        candidateCount: scenario.candidateCount,
        outcomeCounts: scenario.outcomeCounts,
        confidenceCounts: scenario.confidenceCounts,
        inferredReturnSensitivity: scenario.inferredReturnSensitivity,
        baselineTopSix: scenario.baselineTopSix,
        movedPairExplanations: scenario.movedPairExplanations,
        simulations: scenario.simulations.map((simulation) => ({
          variant: simulation.variant,
          cap: simulation.cap,
          topSixChanges: Object.fromEntries(
            (
              [
                'recentPurchases',
                'recommendations',
                'trialRecommendations',
              ] as const
            ).flatMap((groupName) =>
              JSON.stringify(simulation.topSix[groupName]) ===
              JSON.stringify(scenario.baselineTopSix[groupName])
                ? []
                : [[groupName, simulation.topSix[groupName]]],
            ),
          ),
          directlyMovedOutfitCount: simulation.directlyMovedOutfitCount,
          totalChangedPositions: simulation.totalChangedPositions,
          maximumIndividualMovement: simulation.maximumIndividualMovement,
          groupMembershipChanges: simulation.groupMembershipChanges,
        })),
      }))
      const privateReport = {
          queryStrategy: {
            fixedSelectStreams: 6,
            writes: false,
            migrations: false,
          },
          inputCount: report.length,
          totals,
          movementTotals,
          report: compactReport,
        }
      console.log(
        PAIR_REPORT_ONLY
          ? `PHASE5_DIRECT_EVIDENCE_PAIR_REPORT=${JSON.stringify({
              queryStrategy: privateReport.queryStrategy,
              report: compactReport.map((scenario) => ({
                key: scenario.key,
                input: scenario.input,
                baselineTopSix: scenario.baselineTopSix,
                e2TopSix:
                  scenario.simulations.find(
                    (simulation) =>
                      simulation.variant === 'E2' && simulation.cap === 1,
                  )?.topSixChanges ?? {},
                movedPairExplanations: scenario.movedPairExplanations,
              })),
            })}`
          : `PHASE5_DIRECT_EVIDENCE_PRIVATE_REPORT=${JSON.stringify(privateReport)}`,
      )
    }, 60_000)
  },
)
