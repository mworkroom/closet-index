import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  CURRENT_RECENT_PURCHASE_EXCLUDED_CATEGORIES,
  applyAuthoritativeNoveltyOverrides,
  buildRecentPurchaseAuditCandidates,
  deriveInitialNoveltyDate,
  isCurrentRecentPurchaseSourceCategory,
  isN3RecentPurchaseSourceCategory,
  simulateNoveltySourceEligibilityModels,
  type AuthoritativeNoveltyOverride,
  type InitialNoveltyEvidence,
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
  WearLog,
} from '../src/lib/types'

const RUN_PRODUCTION_AUDIT =
  process.env.RUN_PHASE5_RECENT_PURCHASE_SOURCE_AUDIT === 'true'
const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'

function invariant<T>(value: T, message: string): NonNullable<T> {
  if (value === null || value === undefined || value === '') {
    throw new Error(message)
  }
  return value as NonNullable<T>
}

describe.runIf(RUN_PRODUCTION_AUDIT)(
  'read-only production Recent Purchase novelty-source eligibility audit',
  () => {
    it('compares N0-N3 without changing production recommendations', async () => {
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
      const privateLabels = {
        linen: invariant(
          process.env.PHASE5_LINEN_ITEM_LABEL,
          'PHASE5_LINEN_ITEM_LABEL is required',
        ),
        crocs: invariant(
          process.env.PHASE5_CROCS_ITEM_LABEL,
          'PHASE5_CROCS_ITEM_LABEL is required',
        ),
        cabra: invariant(
          process.env.PHASE5_CABRA_ITEM_LABEL,
          'PHASE5_CABRA_ITEM_LABEL is required',
        ),
      }
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
          'id,name,category,semantic_color,seasons,retired,rain_ok,long_walk_ok,memo,acquired_on,current_quantity,created_at',
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
        weatherIssuedAt: (row.weather_issued_at as string | null) ?? null,
        weatherOverridden: Boolean(row.weather_overridden),
        submissionToken: (row.submission_token as string | null) ?? null,
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
      const eventsByItemId = new Map<string, PurchaseEvent[]>()
      for (const event of purchaseEvents) {
        const events = eventsByItemId.get(event.itemId) ?? []
        events.push(event)
        eventsByItemId.set(event.itemId, events)
      }
      const places = placeRows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
      }))
      const transportModes = transportRows.map((row) => ({
        id: row.id as string,
        name: row.name as string,
      }))
      const data: AppData = { items, outfits, wearLogs, places, transportModes }

      const labelForOutfit = (outfit: Outfit) =>
        outfit.displayName?.trim() ||
        outfit.itemIds
          .map((itemId) => itemById.get(itemId)?.name)
          .filter(Boolean)
          .join(' + ') ||
        'Unnamed Outfit'
      const normalized = (value: string) =>
        value.trim().toLocaleLowerCase('ko-KR')
      const resolvePrivateItem = (label: string, role: string) => {
        const exact = items.filter(
          (item) => !item.retired && normalized(item.name) === normalized(label),
        )
        const candidates =
          exact.length > 0
            ? exact
            : items.filter(
                (item) =>
                  !item.retired && normalized(item.name).includes(normalized(label)),
              )
        if (candidates.length !== 1) {
          throw new Error(
            `${role} resolved to ${candidates.length} Items: ${JSON.stringify(
              candidates.map((item) => ({
                label: item.name,
                category: item.category,
                acquiredOn: item.acquiredOn,
                activeOutfits: outfits.filter(
                  (outfit) =>
                    !outfit.archivedAt && outfit.itemIds.includes(item.id),
                ).length,
              })),
            )}`,
          )
        }
        return candidates[0]
      }
      const linenItem = resolvePrivateItem(privateLabels.linen, 'linen')
      const crocsItem = resolvePrivateItem(privateLabels.crocs, 'crocs')
      const cabraItem = resolvePrivateItem(privateLabels.cabra, 'cabra')
      expect(new Set([linenItem.id, crocsItem.id, cabraItem.id]).size).toBe(3)

      const activeInnerwearItems = items.filter(
        (item) =>
          !item.retired &&
          item.category.trim().toLocaleLowerCase('en-US') ===
            'top-t-shirts-innerwear',
      )
      const overrides: AuthoritativeNoveltyOverride[] = [
        {
          itemId: linenItem.id,
          confirmedInitialNoveltyDate: '2024-06-27',
          confirmedRepurchaseDates: ['2026-05-14'],
          reason: 'human-confirmed initial and repurchase dates',
        },
        {
          itemId: crocsItem.id,
          knownOldItem: true,
          confirmedRepurchaseDates: (eventsByItemId.get(crocsItem.id) ?? []).map(
            (event) => event.purchasedOn,
          ),
          reason: 'human-confirmed old Item; recent date is repurchase',
        },
        {
          itemId: cabraItem.id,
          knownOldItem: true,
          confirmedRepurchaseDates: (eventsByItemId.get(cabraItem.id) ?? []).map(
            (event) => event.purchasedOn,
          ),
          reason: 'human-confirmed old Item; recent date is repurchase',
        },
        ...activeInnerwearItems.map(
          (item): AuthoritativeNoveltyOverride => ({
            itemId: item.id,
            noveltySourceEligible: false,
            reason: 'exact Top-T-shirts-innerwear source exclusion',
          }),
        ),
      ]
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
      const overlay = applyAuthoritativeNoveltyOverrides(
        baselineNoveltyByItemId,
        overrides,
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
            (left, right) =>
              Number(/\bto$/iu.test(right.place.name)) -
                Number(/\bto$/iu.test(left.place.name)) ||
              right.count - left.count ||
              left.place.id.localeCompare(right.place.id),
          )[0]?.place,
        'nearby Place with short-walk evidence missing',
      )
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

      const matchingCategoryValues = [
        ...new Set(
          items
            .map((item) => item.category.trim())
            .filter((category) =>
              /innerwear|socks|^acc-/iu.test(category),
            ),
        ),
      ].sort((left, right) => left.localeCompare(right, 'en'))
      const allCategoryValues = [
        ...new Set(items.map((item) => item.category.trim())),
      ].sort((left, right) => left.localeCompare(right, 'en'))

      const scenarioReports = inputs.map((input) => {
        const baseline = recommendOutfits(data, input)
        const baselineGroups = partitionRecommendations(baseline)
        const candidates = buildRecentPurchaseAuditCandidates(
          baseline,
          items,
          baselineNoveltyByItemId,
        )
        const simulations = simulateNoveltySourceEligibilityModels({
          candidates,
          items,
          baselineNoveltyByItemId,
          authoritativeOverrides: overrides,
        })
        const n0 = invariant(
          simulations.find((entry) => entry.model === 'N0'),
          'N0 missing',
        )
        expect(n0.selections.map((entry) => entry.result.outfit.id)).toEqual(
          baselineGroups.recentPurchases.map((entry) => entry.outfit.id),
        )

        const genuineSourceIds = new Set(
          candidates.flatMap((candidate) =>
            candidate.eligibleItemIds.filter((itemId) => {
              const evidence = overlay.noveltyByItemId.get(itemId)
              return Boolean(
                evidence?.initialNoveltyDate &&
                  (evidence.kind === 'first_acquisition' ||
                    evidence.kind === 'handmade_initial_completion'),
              )
            }),
          ),
        )
        const correctedOutfitSourceIds = new Set(
          candidates.flatMap((candidate) => {
            const source = candidate.eligibleItemIds
              .map((itemId) => overlay.noveltyByItemId.get(itemId))
              .filter(
                (
                  evidence,
                ): evidence is InitialNoveltyEvidence & {
                  initialNoveltyDate: string
                } =>
                  Boolean(
                    evidence?.initialNoveltyDate &&
                      (evidence.kind === 'first_acquisition' ||
                        evidence.kind === 'handmade_initial_completion'),
                  ),
              )
              .sort(
                (left, right) =>
                  right.initialNoveltyDate.localeCompare(
                    left.initialNoveltyDate,
                  ) || left.itemId.localeCompare(right.itemId),
              )[0]
            return source ? [source.itemId] : []
          }),
        )
        const n3SourceIds = new Set(
          [...genuineSourceIds].filter((itemId) => {
            const item = itemById.get(itemId)
            return Boolean(
              item &&
                isN3RecentPurchaseSourceCategory(item.category) &&
                overlay.sourceEligibilityByItemId.get(itemId)?.eligible !== false,
            )
          }),
        )
        const currentSourceIds = candidates.flatMap(
          (candidate) => candidate.currentSourceItemIds,
        )
        const selectionRows = simulations.map((simulation) => ({
          model: simulation.model,
          cardCount: simulation.selections.length,
          distinctSourceItemCount: new Set(
            simulation.selections.map((selection) => selection.sourceItemId),
          ).size,
          selections: simulation.selections.map((selection) => {
            const outfitItems = selection.result.outfit.itemIds
            return {
              outfit: labelForOutfit(selection.result.outfit),
              sourceItem: invariant(
                itemById.get(selection.sourceItemId),
                'source Item missing',
              ).name,
              sourceCategory: selection.sourceItemCategory,
              noveltyDate: selection.noveltyDate,
              dateKind: selection.dateKind,
              categoryPolicyApplied: selection.categoryPolicyApplied,
              containsLinenItem: outfitItems.includes(linenItem.id),
              containsTopTShirtsInnerwear: outfitItems.some(
                (itemId) =>
                  itemById
                    .get(itemId)
                    ?.category.trim()
                    .toLocaleLowerCase('en-US') ===
                  'top-t-shirts-innerwear',
              ),
              reason: selection.reason,
            }
          }),
        }))
        const categoryRows = matchingCategoryValues.map((category) => {
          const categoryItemIds = new Set(
            items
              .filter(
                (item) => !item.retired && item.category.trim() === category,
              )
              .map((item) => item.id),
          )
          return {
            category,
            currentSourceAllowed: isCurrentRecentPurchaseSourceCategory(category),
            n3SourceAllowed: isN3RecentPurchaseSourceCategory(category),
            activeItemCount: categoryItemIds.size,
            eligibleOutfitCount: candidates.filter((candidate) =>
              candidate.result.outfit.itemIds.some((itemId) =>
                categoryItemIds.has(itemId),
              ),
            ).length,
            currentLatestSourceCount: candidates.reduce(
              (count, candidate) =>
                count +
                candidate.currentSourceItemIds.filter((itemId) =>
                  categoryItemIds.has(itemId),
                ).length,
              0,
            ),
            finalN0AnchorCount: n0.selections.filter((selection) =>
              categoryItemIds.has(selection.sourceItemId),
            ).length,
          }
        })

        return {
          input: {
            temperature: input.tempOut,
            place: shortPlace.name,
            transport: shortTransport.name,
            rainCondition: input.rainCondition,
            longWalkCondition: input.longWalkCondition,
          },
          candidatePool: {
            temperatureEligibleOutfitCount: candidates.length,
            distinctCurrentSourceItemCount: new Set(currentSourceIds).size,
            distinctSourceItemCountAfterRepurchaseCorrection:
              correctedOutfitSourceIds.size,
            eligibleNoveltySourceCountAfterInnerwearExclusion: n3SourceIds.size,
            genuinelyNewNonInnerwearSourceCount: n3SourceIds.size,
            n3CardCount:
              simulations.find((entry) => entry.model === 'N3')?.selections
                .length ?? 0,
          },
          categories: categoryRows,
          models: selectionRows,
          selectedByModel: new Map(
            simulations.map((simulation) => [
              simulation.model,
              simulation.selections,
            ]),
          ),
        }
      })

      const reviewedItemIds = new Set([
        linenItem.id,
        crocsItem.id,
        cabraItem.id,
        ...activeInnerwearItems
          .filter((item) =>
            scenarioReports.some((scenario) =>
              scenario.selectedByModel
                .get('N0')
                ?.some((selection) => selection.sourceItemId === item.id),
            ),
          )
          .map((item) => item.id),
      ])
      const itemReview = [...reviewedItemIds].map((itemId) => {
        const item = invariant(itemById.get(itemId), 'review Item missing')
        const override = overrides.find((entry) => entry.itemId === itemId)
        const currentTopThreeAppearances = scenarioReports.reduce(
          (count, scenario) =>
            count +
            (scenario.selectedByModel
              .get('N0')
              ?.filter((selection) => selection.sourceItemId === itemId)
              .length ?? 0),
          0,
        )
        const n3TopThreeAppearances = scenarioReports.reduce(
          (count, scenario) =>
            count +
            (scenario.selectedByModel
              .get('N3')
              ?.filter((selection) => selection.sourceItemId === itemId)
              .length ?? 0),
          0,
        )
        const remainsInsideSelectedOutfitUnderAnotherSource =
          scenarioReports.some((scenario) =>
            scenario.selectedByModel.get('N3')?.some(
              (selection) =>
                selection.sourceItemId !== itemId &&
                selection.result.outfit.itemIds.includes(itemId),
            ),
          )
        return {
          label: item.name,
          category: item.category,
          currentAcquiredOn: item.acquiredOn,
          purchaseEventDates: (eventsByItemId.get(itemId) ?? [])
            .map((event) => event.purchasedOn)
            .sort(),
          semanticStatus:
            itemId === linenItem.id
              ? 'confirmed first purchase plus repurchase'
              : itemId === crocsItem.id || itemId === cabraItem.id
                ? 'known old; recent date is repurchase'
                : override?.noveltySourceEligible === false
                  ? 'innerwear source-ineligible'
                  : 'unchanged',
          currentTopThreeAppearances,
          n3TopThreeAppearances,
          remainsInsideSelectedOutfitUnderAnotherSource,
        }
      })

      const output = {
        readOnly: true,
        currentCategoryLogic: {
          exactExcluded: CURRENT_RECENT_PURCHASE_EXCLUDED_CATEGORIES,
          exactAllowed: allCategoryValues.filter(
            isCurrentRecentPurchaseSourceCategory,
          ),
          topTShirtsInnerwearCurrentlyAllowed:
            isCurrentRecentPurchaseSourceCategory(
              'Top-T-shirts-innerwear',
            ),
          matchingCategoriesByScenario: scenarioReports.map((scenario) => ({
            temperature: scenario.input.temperature,
            categories: scenario.categories,
          })),
        },
        privateItemReview: itemReview,
        scenarios: scenarioReports.map(
          ({ selectedByModel: _selectedByModel, categories: _categories, ...rest }) =>
            rest,
        ),
      }

      expect(output.readOnly).toBe(true)
      expect(output.currentCategoryLogic.topTShirtsInnerwearCurrentlyAllowed).toBe(
        true,
      )
      expect(
        output.scenarios.flatMap((scenario) =>
          scenario.models
            .filter((model) => model.model === 'N3')
            .flatMap((model) => model.selections),
        ),
      ).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceCategory: 'Top-T-shirts-innerwear',
          }),
        ]),
      )
      process.stdout.write(
        `\nPHASE5_RECENT_PURCHASE_SOURCE_PRIVATE_REPORT\n${JSON.stringify(output, null, 2)}\n`,
      )
    }, 120_000)
  },
)
