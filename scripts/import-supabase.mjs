import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const DEFAULT_SNAPSHOT = 'data/notion-snapshot.json'
const DEFAULT_COLOR_MAP = 'scripts/color-map.json'
const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'
const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000003'
const EXPECTED_BASELINE = {
  items: 451,
  outfits: 507,
  wearLogs: 783,
  replacementLines: 53,
}

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function hasFlag(name) {
  return process.argv.includes(name)
}

function invariant(value, message) {
  if (!value) throw new Error(message)
  return value
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'))
}

function stableUuid(value) {
  const bytes = Buffer.from(createHash('sha256').update(value).digest().subarray(0, 16))
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

function chunks(values, size = 250) {
  const result = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

function validate(snapshot, colorMap) {
  const blockers = []
  const warnings = []
  const unresolved = snapshot.report?.unresolved ?? {}
  const blockingGroups = [
    'itemName',
    'itemCategory',
    'brokenOutfitItems',
    'wearLogDate',
    'wearLogOutfit',
    'brokenWearLogOutfit',
  ]
  for (const group of blockingGroups) {
    if ((unresolved[group] ?? []).length > 0) {
      blockers.push(`${group}: ${unresolved[group].length}`)
    }
  }

  for (const [key, expected] of Object.entries(EXPECTED_BASELINE)) {
    const actual = snapshot.report?.counts?.[key]
    if (actual !== expected) {
      warnings.push(`baseline ${key}: expected ${expected}, actual ${actual}`)
    }
  }

  const iconIds = new Set(
    snapshot.items.map((item) => item.notionIconId).filter(Boolean),
  )
  const unmappedIconIds = [...iconIds].filter((id) => !colorMap[id])
  if (unmappedIconIds.length > 0) {
    blockers.push(`unmappedColorIcons: ${unmappedIconIds.length}`)
  }

  const invalidHex = Object.entries(colorMap)
    .filter(([key]) => key !== '$schema')
    .filter(([, value]) => !/^#[0-9A-Fa-f]{6}$/.test(value.displayHex ?? ''))
    .map(([key]) => key)
  if (invalidHex.length > 0) {
    blockers.push(`invalidColorHex: ${invalidHex.length}`)
  }

  if ((unresolved.itemColorIcon ?? []).length > 0) {
    warnings.push(
      `items without custom color icon: ${unresolved.itemColorIcon.length}`,
    )
  }
  if ((unresolved.outfitItems ?? []).length > 0) {
    warnings.push(`outfits without items: ${unresolved.outfitItems.length}`)
  }
  if ((unresolved.wearLogTempOut ?? []).length > 0) {
    warnings.push(
      `wear logs without departure temperature: ${unresolved.wearLogTempOut.length}`,
    )
  }
  if ((unresolved.replacementItems ?? []).length > 0) {
    warnings.push(
      `replacement lines without items: ${unresolved.replacementItems.length}`,
    )
  }
  if ((unresolved.replacementStyleIdentity ?? []).length > 0) {
    warnings.push(
      `replacement lines without style identity: ${unresolved.replacementStyleIdentity.length}`,
    )
  }

  return { blockers, warnings, unmappedIconIds, invalidHex }
}

const snapshotPath = argument('--snapshot', DEFAULT_SNAPSHOT)
const colorMapPath = argument('--color-map', DEFAULT_COLOR_MAP)
const apply = hasFlag('--apply')
const allowUnmappedColors = hasFlag('--allow-unmapped-colors')
const envFilePath = resolve(argument('--env-file', '.env.supabase.local'))
if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath)
}
const snapshot = await readJson(snapshotPath)
const colorMap = await readJson(colorMapPath)
const validation = validate(snapshot, colorMap)

if (allowUnmappedColors) {
  validation.blockers = validation.blockers.filter(
    (message) => !message.startsWith('unmappedColorIcons:'),
  )
  if (validation.unmappedIconIds.length > 0) {
    validation.warnings.push(
      `unmapped color icons will use neutral fallback: ${validation.unmappedIconIds.length}`,
    )
  }
}

const workspaceId = process.env.IMPORT_WORKSPACE_ID ?? DEFAULT_WORKSPACE_ID
const placeId = (name) =>
  name ? stableUuid(`closet-index:${workspaceId}:place:${name}`) : null
const transportId = (name) =>
  name ? stableUuid(`closet-index:${workspaceId}:transport:${name}`) : null
const paletteId = (notionIconId) =>
  notionIconId
    ? stableUuid(`closet-index:${workspaceId}:palette:${notionIconId}`)
    : null

const places = [...new Set(snapshot.wearLogs.map((log) => log.place).filter(Boolean))]
  .sort()
  .map((name) => ({
    id: placeId(name),
    workspace_id: workspaceId,
    name,
    active: true,
  }))

const transportModes = [
  ...new Set(snapshot.wearLogs.map((log) => log.transport).filter(Boolean)),
]
  .sort()
  .map((name) => ({
    id: transportId(name),
    workspace_id: workspaceId,
    name,
    active: true,
  }))

const colorPalette = snapshot.colorIcons
  .filter((icon) => colorMap[icon.id])
  .map((icon) => ({
    id: paletteId(icon.id),
    workspace_id: workspaceId,
    notion_icon_id: icon.id,
    display_name: colorMap[icon.id].displayName,
    display_hex: colorMap[icon.id].displayHex.toUpperCase(),
    semantic_color: colorMap[icon.id].semanticColor,
  }))

const items = snapshot.items.map((item) => {
  const mappedColor = item.notionIconId ? colorMap[item.notionIconId] : null
  return {
    id: item.id,
    workspace_id: workspaceId,
    notion_page_id: item.notionPageId,
    name: item.name,
    category: item.category,
    semantic_color: item.semanticColor ?? mappedColor?.semanticColor ?? null,
    palette_id: mappedColor ? paletteId(item.notionIconId) : null,
    seasons: item.seasons,
    retired: item.retired,
    rain_ok: 'unknown',
    long_walk_ok: 'unknown',
    memo: item.memo,
    acquired_on: item.acquiredOn,
    notion_created_at: item.notionCreatedAt,
  }
})

const outfits = snapshot.outfits.map((outfit) => ({
  id: outfit.id,
  workspace_id: workspaceId,
  notion_page_id: outfit.notionPageId,
  display_name: outfit.displayName,
  rating: outfit.rating,
  notion_created_at: outfit.notionCreatedAt,
}))

const outfitItems = snapshot.outfits.flatMap((outfit) =>
  outfit.itemIds.map((itemId, index) => ({
    workspace_id: workspaceId,
    outfit_id: outfit.id,
    item_id: itemId,
    sort_order: index,
  })),
)

const wearLogs = snapshot.wearLogs.map((log) => ({
  id: log.id,
  workspace_id: workspaceId,
  notion_page_id: log.notionPageId,
  outfit_id: log.outfitId,
  worn_on: log.wornOn,
  temp_out: log.tempOut,
  temp_back: log.tempBack,
  temp_back_inferred: log.tempBackInferred,
  feeling_out: log.feelingOut,
  feeling_back: log.feelingBack,
  rain_condition: log.rainCondition,
  long_walk_condition: log.longWalkCondition,
  place_id: placeId(log.place),
  transport_mode_id: transportId(log.transport),
  memo: log.memo,
  temperature_source: 'notion',
  submission_token: stableUuid(`closet-index:notion-log:${log.id}`),
  created_at: log.notionCreatedAt,
  updated_at: log.notionCreatedAt,
}))

const replacementLines = snapshot.replacementLines.map((line) => ({
  id: line.id,
  workspace_id: workspaceId,
  notion_page_id: line.notionPageId,
  name: line.name,
  style_identity: line.styleIdentity,
  notion_created_at: line.notionCreatedAt,
}))

const replacementLineItems = snapshot.replacementLines.flatMap((line) =>
  line.itemIds.map((itemId) => ({
    workspace_id: workspaceId,
    replacement_line_id: line.id,
    item_id: itemId,
  })),
)

const plan = {
  mode: apply ? 'apply' : 'dry-run',
  sourceExtractedAt: snapshot.metadata.extractedAt,
  targetWorkspaceId: workspaceId,
  validation,
  counts: {
    colorPalette: colorPalette.length,
    items: items.length,
    outfits: outfits.length,
    outfitItems: outfitItems.length,
    places: places.length,
    transportModes: transportModes.length,
    wearLogs: wearLogs.length,
    replacementLines: replacementLines.length,
    replacementLineItems: replacementLineItems.length,
  },
  guarantees: {
    deleteExistingRows: false,
    overwriteByStableId: true,
    relationRemovalAutomatic: false,
  },
}

console.log(JSON.stringify(plan, null, 2))

if (!apply) {
  process.exitCode = validation.blockers.length > 0 ? 2 : 0
} else {
  invariant(workspaceId, '적용에는 IMPORT_WORKSPACE_ID 환경값이 필요합니다.')
  invariant(
    validation.blockers.length === 0,
    `적용 차단 항목이 있습니다: ${validation.blockers.join(', ')}`,
  )

  const supabaseUrl = invariant(
    process.env.SUPABASE_URL,
    '적용에는 SUPABASE_URL 환경값이 필요합니다.',
  ).replace(/\/$/, '')
  invariant(
    new URL(supabaseUrl).hostname === `${EXPECTED_PROJECT_REF}.supabase.co`,
    `적용 대상은 mworkroom 프로젝트(${EXPECTED_PROJECT_REF})여야 합니다.`,
  )
  const adminKey = invariant(
    process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    '적용에는 SUPABASE_SECRET_KEY 환경값이 필요합니다.',
  )

  async function upsert(table, rows, onConflict = 'id') {
    if (rows.length === 0) return
    for (const batch of chunks(rows)) {
      const headers = {
        apikey: adminKey,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      }
      if (!adminKey.startsWith('sb_secret_')) {
        headers.Authorization = `Bearer ${adminKey}`
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(batch),
        },
      )
      if (!response.ok) {
        throw new Error(
          `${table} upsert ${response.status}: ${await response.text()}`,
        )
      }
    }
  }

  await upsert('closet_color_palette', colorPalette)
  await upsert('closet_items', items)
  await upsert('closet_outfits', outfits)
  await upsert(
    'closet_outfit_items',
    outfitItems,
    'workspace_id,outfit_id,item_id',
  )
  await upsert('closet_places', places)
  await upsert('closet_transport_modes', transportModes)
  await upsert('closet_wear_logs', wearLogs)
  await upsert('closet_replacement_lines', replacementLines)
  await upsert(
    'closet_replacement_line_items',
    replacementLineItems,
    'workspace_id,replacement_line_id,item_id',
  )
  await upsert('closet_import_runs', [
    {
      id: randomUUID(),
      workspace_id: workspaceId,
      source: 'notion',
      status: 'passed',
      source_snapshot_at: snapshot.metadata.extractedAt,
      counts: plan.counts,
      report: validation,
      completed_at: new Date().toISOString(),
    },
  ])

  console.log('Supabase import completed.')
}
