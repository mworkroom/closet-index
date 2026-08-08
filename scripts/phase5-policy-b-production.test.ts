import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { recommendOutfits } from '../src/lib/recommendation'
import { calculateTransportThermalEvidence } from '../src/lib/transport-thermal-evidence.mjs'
import { evaluateTransportThermalPolicy } from '../src/lib/transport-thermal-policy.mjs'
import type {
  AppData,
  Item,
  Outfit,
  RecommendationInput,
  WearLog,
} from '../src/lib/types'

const RUN_PRODUCTION_COMPARISON =
  process.env.RUN_PHASE5_POLICY_B_PRODUCTION === 'true'
const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'

function invariant<T>(value: T, message: string): NonNullable<T> {
  if (value === null || value === undefined || value === '') {
    throw new Error(message)
  }
  return value as NonNullable<T>
}

function rangeLabel(range: { min: number; max: number } | null | undefined) {
  return range ? `${range.min}~${range.max}°C` : '없음'
}

function movementDirection(oldRank: number, newRank: number) {
  if (newRank < oldRank) return `상승 ${oldRank - newRank}`
  if (newRank > oldRank) return `하락 ${newRank - oldRank}`
  return '동일'
}

describe.runIf(RUN_PRODUCTION_COMPARISON)(
  'read-only production Policy B comparison',
  () => {
    it('compares representative HOME inputs without writes', async () => {
      const envFile = resolve('.env.supabase.local')
      if (existsSync(envFile)) process.loadEnvFile(envFile)

      const supabaseUrl = invariant(
        process.env.SUPABASE_URL,
        'SUPABASE_URL이 필요합니다.',
      ).replace(/\/$/, '')
      invariant(
        new URL(supabaseUrl).hostname === `${EXPECTED_PROJECT_REF}.supabase.co`,
        `audit 대상은 ${EXPECTED_PROJECT_REF} project여야 합니다.`,
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
        outfit.itemIds.map((id) => itemNameById.get(id)).filter(Boolean).join(' + ') ||
        '이름 없는 Outfit'
      const baseInput = {
        tempBack: null,
        rainCondition: 'no' as const,
        longWalkCondition: 'no' as const,
      }
      const matrix: Array<{
        key: string
        purpose: string
        input: RecommendationInput
      }> = [
        {
          key: 'primary-short-walk-33',
          purpose: '33°C primary short-Walk Place',
          input: {
            ...baseInput,
            tempOut: 33,
            placeId: primaryShortPlace.id,
            transportModeId: walkShortId,
          },
        },
        {
          key: 'secondary-short-walk-33',
          purpose: '33°C secondary short-Walk Place',
          input: {
            ...baseInput,
            tempOut: 33,
            placeId: secondaryShortPlace.id,
            transportModeId: walkShortId,
          },
        },
        {
          key: 'primary-short-car-33',
          purpose: 'same primary short-Walk Place changed to Car',
          input: {
            ...baseInput,
            tempOut: 33,
            placeId: primaryShortPlace.id,
            transportModeId: carId,
          },
        },
        {
          key: 'primary-short-walk-30',
          purpose: '30°C primary short-Walk Place',
          input: {
            ...baseInput,
            tempOut: 30,
            placeId: primaryShortPlace.id,
            transportModeId: walkShortId,
          },
        },
        {
          key: 'primary-short-walk-28',
          purpose: '28°C primary short-Walk Place',
          input: {
            ...baseInput,
            tempOut: 28,
            placeId: primaryShortPlace.id,
            transportModeId: walkShortId,
          },
        },
        {
          key: 'primary-sustained-walk-30',
          purpose: '30°C primary sustained-Walk Place',
          input: {
            ...baseInput,
            tempOut: 30,
            placeId: primarySustainedPlace.id,
            transportModeId: walkSustainedId,
          },
        },
        {
          key: 'transport-zero-26',
          purpose: 'current Transport evidence 0 candidates',
          input: {
            ...baseInput,
            tempOut: 26,
            placeId: primaryCinemaPlace.id,
            transportModeId: busId,
          },
        },
        {
          key: 'winter-cold-minus-8',
          purpose: 'winter cold case',
          input: {
            ...baseInput,
            tempOut: -8,
            placeId: primaryCinemaPlace.id,
            transportModeId: carId,
          },
        },
        {
          key: 'place-null-short-26',
          purpose: 'current Place null with short Walk',
          input: {
            ...baseInput,
            tempOut: 26,
            placeId: null,
            transportModeId: walkShortId,
          },
        },
        {
          key: 'transport-null-26',
          purpose: 'current Transport null',
          input: {
            ...baseInput,
            tempOut: 26,
            placeId: primaryCinemaPlace.id,
            transportModeId: null,
          },
        },
        {
          key: 'primary-cinema-car-33',
          purpose: '33°C primary cinema with Car',
          input: {
            ...baseInput,
            tempOut: 33,
            placeId: primaryCinemaPlace.id,
            transportModeId: carId,
          },
        },
      ]

      const report = matrix.map(({ key, purpose, input }) => {
        const baseline = recommendOutfits(data, input)
        const policyB = recommendOutfits(data, input, {
          enableTransportThermalPolicyB: true,
        })
        const oldRank = new Map(
          baseline.map((result, index) => [result.outfit.id, index + 1]),
        )
        const newRank = new Map(
          policyB.map((result, index) => [result.outfit.id, index + 1]),
        )
        const moved = baseline
          .filter(
            (result) =>
              oldRank.get(result.outfit.id) !== newRank.get(result.outfit.id),
          )
          .map((result) => {
            const outfitLogs = wearLogs.filter(
              (log) => log.outfitId === result.outfit.id,
            )
            const evidenceInput = { outfitId: result.outfit.id, ...input }
            const evidence = calculateTransportThermalEvidence(
              outfitLogs,
              evidenceInput,
            )
            const withoutInferred = calculateTransportThermalEvidence(
              outfitLogs,
              evidenceInput,
              { includeInferredReturnObservations: false },
            )
            const decision = evaluateTransportThermalPolicy(
              'weak-1-strong-2',
              evidence,
              evidenceInput,
            )
            const withoutInferredDecision = evaluateTransportThermalPolicy(
              'weak-1-strong-2',
              withoutInferred,
              evidenceInput,
            )
            const previous = invariant(oldRank.get(result.outfit.id), 'old rank')
            const next = invariant(newRank.get(result.outfit.id), 'new rank')
            return {
              label: labelForOutfit(result.outfit),
              oldRank: previous,
              newRank: next,
              movement: movementDirection(previous, next),
              level: result.level,
              reason: decision.affected
                ? `${decision.confidence === 'transport-weak' ? 'weak' : 'strong'} borrowed-only`
                : `간접 이동 (${decision.status})`,
              currentTransportCount:
                evidence.currentTransport?.distinctWearLogCount ?? 0,
              exactContextCount:
                evidence.exactContext?.distinctWearLogCount ?? 0,
              overallRange: rangeLabel(evidence.overall.expandedOkRange),
              currentTransportRange: rangeLabel(
                evidence.currentTransport?.expandedOkRange,
              ),
              inferredReturnAffected:
                decision.rankAdjustment !==
                  withoutInferredDecision.rankAdjustment ||
                evidence.overall.expandedOkRange?.min !==
                  withoutInferred.overall.expandedOkRange?.min ||
                evidence.overall.expandedOkRange?.max !==
                  withoutInferred.overall.expandedOkRange?.max,
            }
          })
        const evidenceInventory = baseline.map((result) => {
          const evidenceInput = { outfitId: result.outfit.id, ...input }
          const evidence = calculateTransportThermalEvidence(
            wearLogs.filter((log) => log.outfitId === result.outfit.id),
            evidenceInput,
          )
          const decision = evaluateTransportThermalPolicy(
            'weak-1-strong-2',
            evidence,
            evidenceInput,
          )
          return {
            label: labelForOutfit(result.outfit),
            currentTransportCount:
              evidence.currentTransport?.distinctWearLogCount ?? 0,
            exactContextCount:
              evidence.exactContext?.distinctWearLogCount ?? 0,
            exactSupported: Boolean(evidence.exactContext?.targetWithinRange),
            decision,
            overallRange: rangeLabel(evidence.overall.expandedOkRange),
            currentTransportRange: rangeLabel(
              evidence.currentTransport?.expandedOkRange,
            ),
            inferredReturnAffected:
              decision.rankAdjustment !==
                evaluateTransportThermalPolicy(
                  'weak-1-strong-2',
                  calculateTransportThermalEvidence(
                    wearLogs.filter(
                      (log) => log.outfitId === result.outfit.id,
                    ),
                    evidenceInput,
                    { includeInferredReturnObservations: false },
                  ),
                  evidenceInput,
                ).rankAdjustment,
          }
        })

        const representative = (
          predicate: (entry: (typeof evidenceInventory)[number]) => boolean,
        ) => {
          const entry = evidenceInventory.find(predicate)
          return entry
            ? {
                label: entry.label,
                currentTransportCount: entry.currentTransportCount,
                exactContextCount: entry.exactContextCount,
                exactSupported: entry.exactSupported,
                reason: entry.decision.affected
                  ? `${entry.decision.confidence === 'transport-weak' ? 'weak' : 'strong'} borrowed-only`
                  : entry.decision.status,
                overallRange: entry.overallRange,
                currentTransportRange: entry.currentTransportRange,
                inferredReturnAffected: entry.inferredReturnAffected,
              }
            : null
        }

        return {
          key,
          purpose,
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
          oldTop: baseline.slice(0, 5).map((result) => labelForOutfit(result.outfit)),
          policyBTop: policyB.slice(0, 5).map((result) => labelForOutfit(result.outfit)),
          moved,
          representatives: {
            zero: representative(
              (entry) => entry.currentTransportCount === 0,
            ),
            one: representative(
              (entry) => entry.currentTransportCount === 1,
            ),
            twoOrMore: representative(
              (entry) => entry.currentTransportCount >= 2,
            ),
            exactTwoOrMoreSupported: representative(
              (entry) => entry.exactContextCount >= 2 && entry.exactSupported,
            ),
            weakBorrowedOnly: representative(
              (entry) =>
                entry.decision.affected && entry.currentTransportCount === 1,
            ),
            strongBorrowedOnly: representative(
              (entry) =>
                entry.decision.affected && entry.currentTransportCount >= 2,
            ),
          },
          evidenceCoverage: {
            zero: evidenceInventory.filter(
              (entry) => entry.currentTransportCount === 0,
            ).length,
            one: evidenceInventory.filter(
              (entry) => entry.currentTransportCount === 1,
            ).length,
            twoOrMore: evidenceInventory.filter(
              (entry) => entry.currentTransportCount >= 2,
            ).length,
            exactTwoOrMoreSupported: evidenceInventory.filter(
              (entry) => entry.exactContextCount >= 2 && entry.exactSupported,
            ).length,
            weakBorrowedOnly: evidenceInventory.filter(
              (entry) =>
                entry.decision.affected && entry.currentTransportCount === 1,
            ).length,
            strongBorrowedOnly: evidenceInventory.filter(
              (entry) =>
                entry.decision.affected && entry.currentTransportCount >= 2,
            ).length,
          },
        }
      })

      const summary = {
        queryStrategy: {
          fixedQueryStreams: 6,
          writes: false,
          migrations: false,
        },
        inputCount: report.length,
        inputsWithRankingChanges: report.filter((entry) => entry.moved.length > 0)
          .length,
        totalMovedOutfitPositions: report.reduce(
          (sum, entry) => sum + entry.moved.length,
          0,
        ),
        report,
      }

      expect(summary.queryStrategy).toEqual({
        fixedQueryStreams: 6,
        writes: false,
        migrations: false,
      })
      expect(report.find((entry) => entry.key === 'transport-zero-26')?.evidenceCoverage.zero).toBeGreaterThan(0)
      expect(report.some((entry) => entry.evidenceCoverage.one > 0)).toBe(true)
      expect(report.some((entry) => entry.evidenceCoverage.twoOrMore > 0)).toBe(true)
      expect(
        report.some((entry) => entry.evidenceCoverage.exactTwoOrMoreSupported > 0),
      ).toBe(true)
      expect(
        report.find((entry) => entry.key === 'transport-null-26')?.moved,
      ).toEqual([])

      const compactPrivateReport = {
        ...summary,
        report: report.map((entry) => ({
          key: entry.key,
          purpose: entry.purpose,
          input: entry.input,
          oldTop: entry.oldTop,
          policyBTop: entry.policyBTop,
          movedCount: entry.moved.length,
          directlyPenalizedMoves: entry.moved.filter((move) =>
            move.reason.endsWith('borrowed-only'),
          ),
          topFiveMoves: entry.moved.filter(
            (move) => move.oldRank <= 5 || move.newRank <= 5,
          ),
          representatives: entry.representatives,
          evidenceCoverage: entry.evidenceCoverage,
        })),
      }
      console.log(
        `PHASE5_POLICY_B_PRIVATE_REPORT=${JSON.stringify(compactPrivateReport)}`,
      )
    }, 60_000)
  },
)
