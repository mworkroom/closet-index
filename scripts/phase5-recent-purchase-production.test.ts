import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  calculateDirectEvidence,
  type DirectEvidenceOutcome,
} from '../src/lib/direct-evidence-policy'
import { rankHomeRecommendationsWithDirectEvidenceE2 } from '../src/lib/direct-evidence-home-ranking'
import {
  buildRecentPurchaseAuditCandidates,
  deriveInitialNoveltyDate,
  simulateRecentPurchasePolicies,
  type InitialNoveltyEvidence,
  type RecentPurchasePolicySelection,
} from '../src/lib/recent-purchase-semantics'
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
  RecommendationResult,
  WearLog,
} from '../src/lib/types'

const RUN_PRODUCTION_AUDIT =
  process.env.RUN_PHASE5_RECENT_PURCHASE_PRODUCTION === 'true'
const COMPACT_REPORT =
  process.env.PHASE5_RECENT_PURCHASE_REPORT_MODE === 'compact'
const SUMMARY_REPORT =
  process.env.PHASE5_RECENT_PURCHASE_REPORT_MODE === 'summary'
const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'

function invariant<T>(value: T, message: string): NonNullable<T> {
  if (value === null || value === undefined || value === '') {
    throw new Error(message)
  }
  return value as NonNullable<T>
}

describe.runIf(RUN_PRODUCTION_AUDIT)(
  'read-only production recent-purchase semantics audit',
  () => {
    it('compares R0, R1, R2, and R3 without changing HOME output', async () => {
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
        'SUPABASE read key is required',
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
          'id,name,category,semantic_color,seasons,retired,rain_ok,long_walk_ok,memo,acquired_on,current_quantity,notion_created_at,created_at,updated_at',
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
      const itemRowById = new Map(
        itemRows.map((row) => [row.id as string, row]),
      )
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
      const outfitById = new Map(outfits.map((outfit) => [outfit.id, outfit]))
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
      const purchaseEvents: PurchaseEvent[] = purchaseEventRows.map((row) => ({
        id: row.id as string,
        itemId: row.item_id as string,
        purchasedOn: row.purchased_on as string,
        quantity: row.quantity as number,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
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

      const eventsByItemId = new Map<string, PurchaseEvent[]>()
      for (const event of purchaseEvents) {
        const events = eventsByItemId.get(event.itemId) ?? []
        events.push(event)
        eventsByItemId.set(event.itemId, events)
      }
      const earliestWearByItemId = new Map<string, string>()
      for (const log of wearLogs) {
        const outfit = outfitById.get(log.outfitId)
        if (!outfit) continue
        for (const itemId of outfit.itemIds) {
          const current = earliestWearByItemId.get(itemId)
          if (!current || log.wornOn < current) {
            earliestWearByItemId.set(itemId, log.wornOn)
          }
        }
      }
      const noveltyByItemId = new Map<string, InitialNoveltyEvidence>(
        items.map((item) => {
          const row = invariant(itemRowById.get(item.id), 'Item row missing')
          return [
            item.id,
            deriveInitialNoveltyDate({
              item,
              purchaseEvents: eventsByItemId.get(item.id) ?? [],
              earliestKnownWearOn: earliestWearByItemId.get(item.id) ?? null,
              notionCreatedAt:
                (row.notion_created_at as string | null) ?? null,
              databaseCreatedAt: (row.created_at as string | null) ?? null,
            }),
          ]
        }),
      )

      const shortTransport = invariant(
        transportModes.find((transport) =>
          /short|근거리/iu.test(transport.name),
        ),
        'short-walk Transport missing',
      )
      const shortPlace = invariant(
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
            (left, right) => {
              const leftReviewedTarget = /\bto$/iu.test(left.place.name) ? 1 : 0
              const rightReviewedTarget = /\bto$/iu.test(right.place.name) ? 1 : 0
              return (
                rightReviewedTarget - leftReviewedTarget ||
                right.count - left.count ||
                left.place.id.localeCompare(right.place.id)
              )
            },
          )[0]?.place,
        'nearby Place with short-walk evidence missing',
      )
      const labelForOutfit = (outfit: Outfit) =>
        outfit.displayName?.trim() ||
        outfit.itemIds
          .map((itemId) => itemById.get(itemId)?.name)
          .filter(Boolean)
          .join(' + ') ||
        'Unnamed Outfit'
      const labelForItem = (itemId: string) =>
        itemById.get(itemId)?.name ?? 'Unknown Item'
      const inputs = [26, 28, 33].map(
        (tempOut): RecommendationInput => ({
          tempOut,
          tempBack: null,
          rainCondition: 'no',
          longWalkCondition: 'no',
          placeId: shortPlace.id,
          transportModeId: shortTransport.id,
        }),
      )

      const scenarioReports = inputs.map((input) => {
        const baseline = recommendOutfits(data, input)
        const baselineGroups = partitionRecommendations(baseline)
        const featureOff = rankHomeRecommendationsWithDirectEvidenceE2(
          data,
          input,
          baselineGroups,
          false,
        )
        expect(featureOff.groups).toBe(baselineGroups)
        expect(featureOff.groups).toEqual(baselineGroups)

        const auditCandidates = buildRecentPurchaseAuditCandidates(
          baseline,
          items,
          noveltyByItemId,
        )
        const directOutcomeByOutfitId = new Map<string, DirectEvidenceOutcome>(
          auditCandidates.map((candidate) => [
            candidate.result.outfit.id,
            calculateDirectEvidence(
              wearLogs.filter(
                (log) => log.outfitId === candidate.result.outfit.id,
              ),
              input,
            ).exactContext.outcome,
          ]),
        )
        const simulations = simulateRecentPurchasePolicies({
          candidates: auditCandidates,
          noveltyByItemId,
          directOutcomeByOutfitId,
        })
        const r0 = invariant(
          simulations.find((simulation) => simulation.policy === 'R0'),
          'R0 missing',
        )
        expect(
          r0.selections.map((selection) => selection.result.outfit.id),
        ).toEqual(
          baselineGroups.recentPurchases.map((result) => result.outfit.id),
        )

        const sourceUseCount = new Map<string, number>()
        for (const candidate of auditCandidates) {
          for (const itemId of candidate.currentSourceItemIds) {
            sourceUseCount.set(itemId, (sourceUseCount.get(itemId) ?? 0) + 1)
          }
        }
        const candidateTable = auditCandidates.map((candidate) => ({
          outfit: labelForOutfit(candidate.result.outfit),
          baselineRank: candidate.baselineRank,
          level: candidate.result.level,
          overallRange: candidate.result.okRange,
          latestAcquiredOn: candidate.result.latestAcquiredOn,
          sourceItems: candidate.currentSourceItemIds.map((itemId) => {
            const evidence = invariant(
              noveltyByItemId.get(itemId),
              'novelty evidence missing',
            )
            return {
              item: labelForItem(itemId),
              classification: evidence.kind,
              initialNoveltyDate: evidence.initialNoveltyDate,
              latestRepurchaseOn: evidence.latestRepurchaseOn,
              purchaseEventCount: evidence.purchaseEventCount,
              duplicateEligibleSlots: sourceUseCount.get(itemId) ?? 0,
            }
          }),
          exactContextOutcome:
            directOutcomeByOutfitId.get(candidate.result.outfit.id) ?? 'unknown',
        }))

        const selectionRow = (selection: RecentPurchasePolicySelection) => ({
          outfitId: selection.result.outfit.id,
          outfit: labelForOutfit(selection.result.outfit),
          sourceItemId: selection.sourceItemId,
          sourceItem: labelForItem(selection.sourceItemId),
          noveltyDate: selection.noveltyDate,
          noveltyKind: selection.noveltyKind,
          directOutcome: selection.directOutcome,
          reason: selection.reason,
        })
        const simulationTable = simulations.map((simulation) => {
          const selections = simulation.selections.map(selectionRow)
          const distinctSourceItems = new Set(
            simulation.selections.map((selection) => selection.sourceItemId),
          ).size
          const outcomeCounts = {
            directSupport: simulation.selections.filter(
              (selection) => selection.directOutcome === 'direct_support',
            ).length,
            directIssue: simulation.selections.filter(
              (selection) => selection.directOutcome === 'direct_issue',
            ).length,
            mixed: simulation.selections.filter(
              (selection) => selection.directOutcome === 'mixed',
            ).length,
            unknown: simulation.selections.filter(
              (selection) => selection.directOutcome === 'unknown',
            ).length,
          }
          return {
            policy: simulation.policy,
            variant: simulation.variant,
            cardCount: selections.length,
            distinctNoveltyItemCount: distinctSourceItems,
            duplicateSourceItemCount: selections.length - distinctSourceItems,
            repurchaseDerivedCardCount: simulation.selections.filter(
              (selection) =>
                selection.noveltyKind === 'repurchase_or_replenishment',
            ).length,
            genuinelyNewCardCount: simulation.selections.filter(
              (selection) =>
                selection.noveltyKind === 'first_acquisition' ||
                selection.noveltyKind === 'handmade_initial_completion',
            ).length,
            outcomeCounts,
            recentMembershipDiffersFromR0:
              JSON.stringify(
                simulation.selections.map(
                  (selection) => selection.result.outfit.id,
                ),
              ) !==
              JSON.stringify(
                r0.selections.map((selection) => selection.result.outfit.id),
              ),
            normalRecommendationMembershipChanges: 0,
            selections,
          }
        })
        const currentSourceItemIds = auditCandidates.flatMap(
          (candidate) => candidate.currentSourceItemIds,
        )
        const currentSourceKinds = currentSourceItemIds.map(
          (itemId) => noveltyByItemId.get(itemId)?.kind ?? 'unknown',
        )
        return {
          input: {
            tempOut: input.tempOut,
            place: shortPlace.name,
            transport: shortTransport.name,
          },
          eligibleOutfitCount: auditCandidates.length,
          distinctCurrentSourceItemCount: new Set(currentSourceItemIds).size,
          genuinelyNewSourceItemCount: new Set(
            currentSourceItemIds.filter((_, index) =>
              ['first_acquisition', 'handmade_initial_completion'].includes(
                currentSourceKinds[index],
              ),
            ),
          ).size,
          repurchasedSourceItemCount: new Set(
            currentSourceItemIds.filter(
              (_, index) =>
                currentSourceKinds[index] === 'repurchase_or_replenishment',
            ),
          ).size,
          duplicateSlotsFromSameCurrentSource:
            currentSourceItemIds.length - new Set(currentSourceItemIds).size,
          candidateTable,
          simulations: simulationTable,
          baselineByOutfitId: new Map(
            baseline.map((result) => [result.outfit.id, result]),
          ),
          directOutcomeByOutfitId,
        }
      })

      const hotScenario = invariant(
        scenarioReports.find((scenario) => scenario.input.tempOut === 33),
        '33 degree scenario missing',
      )
      const hotR0 = invariant(
        hotScenario.simulations.find(
          (simulation) => simulation.policy === 'R0',
        ),
        '33 degree R0 missing',
      )
      const hotCandidates = buildRecentPurchaseAuditCandidates(
        [...hotScenario.baselineByOutfitId.values()],
        items,
        noveltyByItemId,
      )
      const hotRepurchaseSourceCounts = new Map<string, number>()
      for (const candidate of hotCandidates) {
        for (const itemId of candidate.currentSourceItemIds) {
          const sourceItem = itemById.get(itemId)
          if (
            sourceItem?.category.toLowerCase().includes('outer') &&
            noveltyByItemId.get(itemId)?.kind ===
            'repurchase_or_replenishment'
          ) {
            hotRepurchaseSourceCounts.set(
              itemId,
              (hotRepurchaseSourceCounts.get(itemId) ?? 0) + 1,
            )
          }
        }
      }
      const targetItemId = invariant(
        [...hotRepurchaseSourceCounts]
          .sort(
            (left, right) =>
              right[1] - left[1] || left[0].localeCompare(right[0]),
          )[0]?.[0],
        'reported repeated source Item could not be identified',
      )
      const targetItem = invariant(itemById.get(targetItemId), 'target Item missing')
      const targetRow = invariant(itemRowById.get(targetItemId), 'target row missing')
      const targetEvidence = invariant(
        noveltyByItemId.get(targetItemId),
        'target novelty missing',
      )
      const targetOutfits = outfits
        .filter(
          (outfit) => !outfit.archivedAt && outfit.itemIds.includes(targetItemId),
        )
        .map((outfit) => ({
          outfit: labelForOutfit(outfit),
          byTemperature: scenarioReports.map((scenario) => {
            const result = scenario.baselineByOutfitId.get(outfit.id)
            const simulation = invariant(
              scenario.simulations.find(
                (entry) => entry.policy === 'R0',
              ),
              'R0 missing',
            )
            return {
              tempOut: scenario.input.tempOut,
              entersCurrentRecentPurchase: simulation.selections.some(
                (selection) => selection.outfit === labelForOutfit(outfit),
              ),
              overallRange: result?.okRange ?? null,
              exactContextOutcome:
                scenario.directOutcomeByOutfitId.get(outfit.id) ?? 'unknown',
              latestAcquiredOn: result?.latestAcquiredOn ?? null,
              latestAcquiredItems:
                result?.latestAcquiredItemNames ?? [],
            }
          }),
        }))
      const report = {
        readOnly: true,
        itemCount: items.length,
        outfitCount: outfits.length,
        wearLogCount: wearLogs.length,
        purchaseEventCount: purchaseEvents.length,
        reportedItem: {
          label: targetItem.name,
          acquiredOn: targetItem.acquiredOn,
          notionCreatedAt:
            (targetRow.notion_created_at as string | null) ?? null,
          databaseCreatedAt: (targetRow.created_at as string | null) ?? null,
          databaseUpdatedAt: (targetRow.updated_at as string | null) ?? null,
          currentQuantity: targetItem.currentQuantity ?? null,
          purchaseEvents: (eventsByItemId.get(targetItemId) ?? [])
            .sort(
              (left, right) =>
                left.purchasedOn.localeCompare(right.purchasedOn) ||
                left.id.localeCompare(right.id),
            )
            .map((event) => ({
              purchasedOn: event.purchasedOn,
              quantity: event.quantity,
              createdAt: event.createdAt,
              updatedAt: event.updatedAt,
            })),
          noveltyEvidence: targetEvidence,
          activeOutfitCount: targetOutfits.length,
          activeOutfits: targetOutfits,
        },
        scenarios: scenarioReports.map(
          ({ baselineByOutfitId, directOutcomeByOutfitId, ...scenario }) =>
            scenario,
        ),
      }

      expect(report.readOnly).toBe(true)
      expect(targetEvidence.kind).toBe('repurchase_or_replenishment')
      expect(targetEvidence.exactFirstAcquisitionKnown).toBe(false)
      expect(report.reportedItem.purchaseEvents).toHaveLength(0)
      const summaryOutput = {
        readOnly: report.readOnly,
        reportedItem: {
          label: report.reportedItem.label,
          acquiredOn: report.reportedItem.acquiredOn,
          currentQuantity: report.reportedItem.currentQuantity,
          purchaseEvents: report.reportedItem.purchaseEvents,
          noveltyEvidence: report.reportedItem.noveltyEvidence,
          activeOutfitCount: report.reportedItem.activeOutfitCount,
          temperatureEligibleOutfits: report.reportedItem.activeOutfits.filter(
            (outfit) =>
              outfit.byTemperature.some(
                (entry) => entry.entersCurrentRecentPurchase,
              ),
          ),
        },
        scenarios: report.scenarios.map((scenario) => ({
          input: scenario.input,
          eligibleOutfitCount: scenario.eligibleOutfitCount,
          distinctCurrentSourceItemCount:
            scenario.distinctCurrentSourceItemCount,
          genuinelyNewSourceItemCount: scenario.genuinelyNewSourceItemCount,
          repurchasedSourceItemCount: scenario.repurchasedSourceItemCount,
          duplicateSlotsFromSameCurrentSource:
            scenario.duplicateSlotsFromSameCurrentSource,
          simulations: scenario.simulations.map((simulation) => ({
            policy: simulation.policy,
            variant: simulation.variant,
            cardCount: simulation.cardCount,
            distinctNoveltyItemCount: simulation.distinctNoveltyItemCount,
            duplicateSourceItemCount: simulation.duplicateSourceItemCount,
            repurchaseDerivedCardCount: simulation.repurchaseDerivedCardCount,
            genuinelyNewCardCount: simulation.genuinelyNewCardCount,
            outcomeCounts: simulation.outcomeCounts,
            recentMembershipDiffersFromR0:
              simulation.recentMembershipDiffersFromR0,
            selections: simulation.selections.map(
              ({ outfitId: _outfitId, sourceItemId: _sourceItemId, ...selection }) =>
                selection,
            ),
          })),
        })),
      }
      const output = SUMMARY_REPORT
        ? summaryOutput
        : COMPACT_REPORT
        ? {
            readOnly: report.readOnly,
            counts: {
              items: report.itemCount,
              outfits: report.outfitCount,
              wearLogs: report.wearLogCount,
              purchaseEvents: report.purchaseEventCount,
            },
            reportedItem: {
              label: report.reportedItem.label,
              acquiredOn: report.reportedItem.acquiredOn,
              notionCreatedAt: report.reportedItem.notionCreatedAt,
              databaseCreatedAt: report.reportedItem.databaseCreatedAt,
              databaseUpdatedAt: report.reportedItem.databaseUpdatedAt,
              currentQuantity: report.reportedItem.currentQuantity,
              purchaseEvents: report.reportedItem.purchaseEvents,
              noveltyEvidence: {
                initialNoveltyDate:
                  report.reportedItem.noveltyEvidence.initialNoveltyDate,
                source: report.reportedItem.noveltyEvidence.source,
                kind: report.reportedItem.noveltyEvidence.kind,
                confidence: report.reportedItem.noveltyEvidence.confidence,
                incompleteHistory:
                  report.reportedItem.noveltyEvidence.incompleteHistory,
                exactFirstAcquisitionKnown:
                  report.reportedItem.noveltyEvidence.exactFirstAcquisitionKnown,
                earliestKnownWearOn:
                  report.reportedItem.noveltyEvidence.earliestKnownWearOn,
                latestRepurchaseOn:
                  report.reportedItem.noveltyEvidence.latestRepurchaseOn,
                purchaseEventCount:
                  report.reportedItem.noveltyEvidence.purchaseEventCount,
              },
              activeOutfitCount: report.reportedItem.activeOutfitCount,
              activeOutfits: report.reportedItem.activeOutfits,
            },
            scenarios: report.scenarios.map((scenario) => ({
              input: scenario.input,
              eligibleOutfitCount: scenario.eligibleOutfitCount,
              distinctCurrentSourceItemCount:
                scenario.distinctCurrentSourceItemCount,
              genuinelyNewSourceItemCount:
                scenario.genuinelyNewSourceItemCount,
              repurchasedSourceItemCount:
                scenario.repurchasedSourceItemCount,
              duplicateSlotsFromSameCurrentSource:
                scenario.duplicateSlotsFromSameCurrentSource,
              candidateTable: scenario.candidateTable,
              simulations: scenario.simulations.map((simulation) => ({
                ...simulation,
                selections: simulation.selections.map(
                  ({ outfitId: _outfitId, sourceItemId: _sourceItemId, ...selection }) =>
                    selection,
                ),
              })),
            })),
          }
        : report
      process.stdout.write(
        `\nPHASE5_RECENT_PURCHASE_PRIVATE_REPORT\n${JSON.stringify(output, null, 2)}\n`,
      )
    }, 120_000)
  },
)
