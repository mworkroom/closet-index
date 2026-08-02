import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  analyzeNotionSnapshot,
  analyzeReplacementLines,
  compareBaseline,
  PHASE4_EXPECTED_BASELINE,
} from './phase4-baseline-audit-core.mjs'

const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function invariant(value, message) {
  if (!value) throw new Error(message)
  return value
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'))
}

const envFilePath = resolve(argument('--env-file', '.env.supabase.local'))
if (existsSync(envFilePath)) process.loadEnvFile(envFilePath)

const supabaseUrl = invariant(
  process.env.SUPABASE_URL,
  'SUPABASE_URL이 필요합니다.',
).replace(/\/$/, '')
invariant(
  new URL(supabaseUrl).hostname === `${EXPECTED_PROJECT_REF}.supabase.co`,
  `audit 대상은 mworkroom 프로젝트(${EXPECTED_PROJECT_REF})여야 합니다.`,
)
const secretKey = invariant(
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
  'SUPABASE_SECRET_KEY가 필요합니다.',
)
const workspaceId = invariant(
  process.env.IMPORT_WORKSPACE_ID,
  'IMPORT_WORKSPACE_ID가 필요합니다.',
)
const client = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function collectAll(table, columns) {
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const result = await client
      .from(table)
      .select(columns)
      .eq('workspace_id', workspaceId)
      .range(from, from + pageSize - 1)
    if (result.error) throw result.error
    rows.push(...(result.data ?? []))
    if ((result.data?.length ?? 0) < pageSize) return rows
  }
}

const [items, outfits, outfitItems, wearLogs, lines, memberships] =
  await Promise.all([
  collectAll('closet_items', 'id,acquired_on'),
  collectAll(
    'closet_outfits',
    'id,notion_page_id,created_at,archived_at',
  ),
  collectAll('closet_outfit_items', 'outfit_id,item_id'),
  collectAll(
    'closet_wear_logs',
    'id,outfit_id,notion_page_id,worn_on,created_at',
  ),
  collectAll('closet_replacement_lines', 'id,style_identity'),
  collectAll(
    'closet_replacement_line_items',
    'replacement_line_id,item_id',
  ),
  ])

const lineAnalysis = analyzeReplacementLines(
  lines.map((line) => ({
    id: line.id,
    styleIdentity: line.style_identity,
  })),
  memberships.map((membership) => ({
    replacementLineId: membership.replacement_line_id,
    itemId: membership.item_id,
  })),
)
const production = {
  items: items.length,
  outfits: outfits.length,
  notionBackedOutfits: outfits.filter((outfit) => outfit.notion_page_id).length,
  appCreatedOutfits: outfits.filter((outfit) => !outfit.notion_page_id).length,
  wearLogs: wearLogs.length,
  notionBackedWearLogs: wearLogs.filter((wearLog) => wearLog.notion_page_id)
    .length,
  appCreatedWearLogs: wearLogs.filter((wearLog) => !wearLog.notion_page_id)
    .length,
  acquiredKnown: items.filter((item) => item.acquired_on).length,
  acquiredUnknown: items.filter((item) => !item.acquired_on).length,
  replacementLines: lineAnalysis.replacementLines,
  replacementMemberships: lineAnalysis.replacementMemberships,
  replacementUniqueItems: lineAnalysis.replacementUniqueItems,
  emptyLines: lineAnalysis.emptyLines,
  singleItemLines: lineAnalysis.singleItemLines,
  multiItemLines: lineAnalysis.multiItemLines,
  multiLineItems: lineAnalysis.multiLineItems,
  missingStyleIdentity: lineAnalysis.missingStyleIdentity,
  orphanMemberships: lineAnalysis.orphanMemberships,
}

const notionSnapshotPath = argument('--notion-snapshot')
const notionSnapshot = notionSnapshotPath
  ? await readJson(notionSnapshotPath)
  : null
const notion = notionSnapshot ? analyzeNotionSnapshot(notionSnapshot) : null
const outfitItemCounts = new Map()
for (const relation of outfitItems) {
  outfitItemCounts.set(
    relation.outfit_id,
    (outfitItemCounts.get(relation.outfit_id) ?? 0) + 1,
  )
}
const outfitWearLogCounts = new Map()
for (const wearLog of wearLogs) {
  outfitWearLogCounts.set(
    wearLog.outfit_id,
    (outfitWearLogCounts.get(wearLog.outfit_id) ?? 0) + 1,
  )
}
const notionOutfitIds = new Set(
  (notionSnapshot?.outfits ?? []).map(
    (outfit) => outfit.notionPageId ?? outfit.id,
  ),
)
const productionNotionOutfitIds = new Set(
  outfits.map((outfit) => outfit.notion_page_id).filter(Boolean),
)
const productionItemIdsByOutfit = new Map()
for (const relation of outfitItems) {
  const itemIds = productionItemIdsByOutfit.get(relation.outfit_id) ?? []
  itemIds.push(relation.item_id)
  productionItemIdsByOutfit.set(relation.outfit_id, itemIds)
}
function itemSetKey(itemIds = []) {
  return [...new Set(itemIds)].sort((left, right) =>
    left.localeCompare(right),
  ).join('|')
}
const missingNotionOutfits = (notionSnapshot?.outfits ?? []).filter(
  (outfit) =>
    !productionNotionOutfitIds.has(outfit.notionPageId ?? outfit.id),
)
const missingNotionOutfitsByItemSet = new Map(
  missingNotionOutfits.map((outfit) => [itemSetKey(outfit.itemIds), outfit]),
)
const productionWearLogsByNotionPageId = new Map(
  wearLogs
    .filter((wearLog) => wearLog.notion_page_id)
    .map((wearLog) => [wearLog.notion_page_id, wearLog]),
)
const appCreatedOutfitDetails = outfits
  .filter((outfit) => !outfit.notion_page_id)
  .map((outfit) => ({
    id: outfit.id,
    createdAt: outfit.created_at,
    archived: Boolean(outfit.archived_at),
    itemCount: outfitItemCounts.get(outfit.id) ?? 0,
    wearLogCount: outfitWearLogCounts.get(outfit.id) ?? 0,
    sameItemSetAsMissingNotionOutfit: missingNotionOutfitsByItemSet.has(
      itemSetKey(productionItemIdsByOutfit.get(outfit.id)),
    ),
  }))
const outfitOrigin = {
  appCreatedOutfitDetails,
  missingNotionOutfitDetails: missingNotionOutfits.map((outfit) => ({
    notionPageId: outfit.notionPageId ?? outfit.id,
    itemCount: new Set(outfit.itemIds ?? []).size,
    wearLogCount: (notionSnapshot?.wearLogs ?? []).filter(
      (wearLog) => wearLog.outfitId === (outfit.notionPageId ?? outfit.id),
    ).length,
    productionWearLogDestinationOutfitIds: [
      ...new Set(
        (notionSnapshot?.wearLogs ?? [])
          .filter(
            (wearLog) =>
              wearLog.outfitId === (outfit.notionPageId ?? outfit.id),
          )
          .map(
            (wearLog) =>
              productionWearLogsByNotionPageId.get(
                wearLog.notionPageId ?? wearLog.id,
              )?.outfit_id,
          )
          .filter(Boolean),
      ),
    ],
    sameItemSetAsAppCreatedOutfit: appCreatedOutfitDetails.some(
      (candidate) =>
        candidate.sameItemSetAsMissingNotionOutfit &&
        itemSetKey(productionItemIdsByOutfit.get(candidate.id)) ===
          itemSetKey(outfit.itemIds),
    ),
  })),
  notionOutfitsMissingInProduction: notionSnapshot
    ? [...notionOutfitIds].filter(
        (notionPageId) => !productionNotionOutfitIds.has(notionPageId),
      ).length
    : null,
  productionNotionOutfitsMissingInSnapshot: notionSnapshot
    ? [...productionNotionOutfitIds].filter(
        (notionPageId) => !notionOutfitIds.has(notionPageId),
      ).length
    : null,
}
const notionWearLogIds = new Set(
  (notionSnapshot?.wearLogs ?? []).map(
    (wearLog) => wearLog.notionPageId ?? wearLog.id,
  ),
)
const productionNotionWearLogIds = new Set(
  wearLogs.map((wearLog) => wearLog.notion_page_id).filter(Boolean),
)
const missingNotionWearLogs = (notionSnapshot?.wearLogs ?? []).filter(
  (wearLog) =>
    !productionNotionWearLogIds.has(wearLog.notionPageId ?? wearLog.id),
)
const wearLogOrigin = {
  appCreatedWearLogDetails: wearLogs
    .filter((wearLog) => !wearLog.notion_page_id)
    .map((wearLog) => ({
      id: wearLog.id,
      outfitId: wearLog.outfit_id,
      wornOn: wearLog.worn_on,
      createdAt: wearLog.created_at,
      sameWornOnAsMissingNotionWearLog: missingNotionWearLogs.some(
        (notionWearLog) => notionWearLog.wornOn === wearLog.worn_on,
      ),
    })),
  missingNotionWearLogDetails: missingNotionWearLogs.map((wearLog) => ({
    notionPageId: wearLog.notionPageId ?? wearLog.id,
    outfitId: wearLog.outfitId,
    wornOn: wearLog.wornOn,
  })),
  notionWearLogsMissingInProduction: notionSnapshot
    ? [...notionWearLogIds].filter(
        (notionPageId) => !productionNotionWearLogIds.has(notionPageId),
      ).length
    : null,
  productionNotionWearLogsMissingInSnapshot: notionSnapshot
    ? [...productionNotionWearLogIds].filter(
        (notionPageId) => !notionWearLogIds.has(notionPageId),
      ).length
    : null,
}
const mismatches = {
  production: compareBaseline(
    production,
    PHASE4_EXPECTED_BASELINE.production,
  ),
  notion: notion
    ? compareBaseline(notion, PHASE4_EXPECTED_BASELINE.notion)
    : [],
  outfitOrigin: notion
    ? compareBaseline(
        outfitOrigin,
        PHASE4_EXPECTED_BASELINE.outfitOrigin,
      )
    : [],
  wearLogOrigin: notion
    ? compareBaseline(
        wearLogOrigin,
        PHASE4_EXPECTED_BASELINE.wearLogOrigin,
      )
    : [],
}
const report = {
  auditedAt: new Date().toISOString(),
  guarantees: {
    productionWrites: false,
    notionWrites: false,
    directionInferred: false,
  },
  production,
  notion,
  outfitOrigin,
  wearLogOrigin,
  matchesExpectedBaseline:
    Object.values(mismatches).every((entries) => entries.length === 0),
  mismatches,
}

const outputPath = argument('--output')
if (outputPath) {
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`)
}
console.log(JSON.stringify(report, null, 2))
if (!report.matchesExpectedBaseline) process.exitCode = 2
