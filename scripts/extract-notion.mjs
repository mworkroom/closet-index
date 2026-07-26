import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const API_ROOT = 'https://api.notion.com/v1'
const LOCAL_CONFIG = 'scripts/notion-source.json'
const DEFAULT_CONFIG = existsSync(resolve(LOCAL_CONFIG))
  ? LOCAL_CONFIG
  : 'scripts/notion-source.example.json'
const DEFAULT_OUTPUT = 'data/notion-snapshot.json'

function argument(name, fallback) {
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

const envFilePath = resolve(argument('--env-file', '.env.notion.local'))
if (existsSync(envFilePath)) {
  process.loadEnvFile(envFilePath)
}

const token = process.env.NOTION_API_KEY
invariant(
  token,
  'NOTION_API_KEY가 필요합니다. .env.notion.example을 .env.notion.local로 복사한 뒤 토큰을 입력하세요.',
)

const configPath = argument('--config', DEFAULT_CONFIG)
const outputPath = resolve(argument('--output', DEFAULT_OUTPUT))
const config = await readJson(configPath)
const notionVersion = config.apiVersion ?? '2026-03-11'

async function notionRequest(path, init = {}, attempt = 0) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': notionVersion,
      ...init.headers,
    },
  })

  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const retryAfter = Number(response.headers.get('retry-after') ?? 1)
    await new Promise((resolveDelay) =>
      setTimeout(resolveDelay, Math.max(1, retryAfter) * 1000),
    )
    return notionRequest(path, init, attempt + 1)
  }

  if (!response.ok) {
    throw new Error(
      `Notion API ${response.status}: ${await response.text()}`,
    )
  }
  return response.json()
}

async function queryAll(dataSourceId) {
  const results = []
  let cursor = null
  do {
    const response = await notionRequest(
      `/data_sources/${dataSourceId}/query`,
      {
        method: 'POST',
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    )
    results.push(...response.results.filter((entry) => entry.object === 'page'))
    cursor = response.has_more ? response.next_cursor : null
  } while (cursor)
  return results
}

function property(page, name) {
  return name ? page.properties?.[name] ?? null : null
}

function plainText(parts = []) {
  return parts.map((part) => part.plain_text ?? '').join('').trim()
}

function textValue(value) {
  if (!value) return null
  if (value.type === 'title') return plainText(value.title) || null
  if (value.type === 'rich_text') return plainText(value.rich_text) || null
  if (value.type === 'formula' && value.formula?.type === 'string') {
    return value.formula.string?.trim() || null
  }
  return null
}

function optionValue(value) {
  if (!value) return null
  if (value.type === 'select') return value.select?.name ?? null
  if (value.type === 'status') return value.status?.name ?? null
  return textValue(value)
}

function multiValue(value) {
  if (!value) return []
  if (value.type === 'multi_select') {
    return value.multi_select.map((entry) => entry.name)
  }
  const single = optionValue(value)
  return single ? [single] : []
}

function numberValue(value) {
  if (!value) return null
  if (value.type === 'number') return value.number
  if (value.type === 'formula' && value.formula?.type === 'number') {
    return value.formula.number
  }
  return null
}

function booleanValue(value) {
  if (!value) return false
  if (value.type === 'checkbox') return Boolean(value.checkbox)
  return optionValue(value)?.toLocaleLowerCase('en') === 'retired'
}

function dateValue(value) {
  if (!value) return null
  if (value.type === 'date') return value.date?.start?.slice(0, 10) ?? null
  if (value.type === 'formula' && value.formula?.type === 'date') {
    return value.formula.date?.start?.slice(0, 10) ?? null
  }
  return null
}

async function relationValue(page, name) {
  const value = property(page, name)
  if (!value || value.type !== 'relation') return []
  const ids = value.relation.map((entry) => entry.id)
  if (!value.has_more) return ids

  let cursor = null
  do {
    const query = new URLSearchParams({ page_size: '100' })
    if (cursor) query.set('start_cursor', cursor)
    const response = await notionRequest(
      `/pages/${page.id}/properties/${encodeURIComponent(value.id)}?${query}`,
    )
    const relationEntries = response.results ?? []
    ids.push(
      ...relationEntries
        .filter((entry) => entry.type === 'relation')
        .map((entry) => entry.relation.id),
    )
    cursor = response.has_more ? response.next_cursor : null
  } while (cursor)

  return [...new Set(ids)]
}

function iconValue(page) {
  if (page.icon?.type !== 'custom_emoji') return null
  return {
    id: page.icon.custom_emoji.id,
    name: page.icon.custom_emoji.name,
    sourceUrl: page.icon.custom_emoji.url,
  }
}

function normalizedFeeling(value) {
  const option = optionValue(value)
  return (
    {
      '추움': 'cold',
      OK: 'ok',
      '더움': 'hot',
    }[option] ?? null
  )
}

function normalizedRating(value) {
  const option = optionValue(value)
  return (
    {
      Favorite: 'favorite',
      OK: 'ok',
      Error: 'error',
    }[option] ?? null
  )
}

function expectInteger(value, label, pageId) {
  if (value === null) return null
  if (!Number.isInteger(value)) {
    throw new Error(`${label} 값이 정수가 아닙니다: ${pageId} (${value})`)
  }
  return value
}

const [wardrobePages, outfitPages, dailyPages, replacementPages] =
  await Promise.all([
    queryAll(config.dataSources.wardrobe),
    queryAll(config.dataSources.outfits),
    queryAll(config.dataSources.dailyLog),
    queryAll(config.dataSources.replacementLine),
  ])

const wp = config.properties.wardrobe
const op = config.properties.outfits
const dp = config.properties.dailyLog
const rp = config.properties.replacementLine

const items = wardrobePages.map((page) => {
  const icon = iconValue(page)
  return {
    id: page.id,
    notionPageId: page.id,
    name: textValue(property(page, wp.name)),
    category: optionValue(property(page, wp.category)),
    semanticColor: optionValue(property(page, wp.color)),
    notionIconId: icon?.id ?? null,
    seasons: multiValue(property(page, wp.seasons)),
    retired: booleanValue(property(page, wp.retired)),
    memo: textValue(property(page, wp.memo)),
    acquiredOn: dateValue(property(page, wp.acquiredOn)),
    notionCreatedAt: page.created_time,
  }
})

const outfits = []
for (const page of outfitPages) {
  outfits.push({
    id: page.id,
    notionPageId: page.id,
    displayName: textValue(property(page, op.name)),
    rating: normalizedRating(property(page, op.rating)),
    itemIds: await relationValue(page, op.items),
    notionCreatedAt:
      property(page, op.createdTime)?.created_time ?? page.created_time,
  })
}

const wearLogs = []
for (const page of dailyPages) {
  if (optionValue(property(page, dp.category)) !== dp.outfitCategoryValue) continue
  const outfitIds = await relationValue(page, dp.outfit)
  const tempOut = expectInteger(
    numberValue(property(page, dp.tempOut)),
    dp.tempOut,
    page.id,
  )
  const rawTempBack = expectInteger(
    numberValue(property(page, dp.tempBack)),
    dp.tempBack,
    page.id,
  )
  wearLogs.push({
    id: page.id,
    notionPageId: page.id,
    outfitId: outfitIds[0] ?? null,
    wornOn: dateValue(property(page, dp.date)),
    tempOut,
    tempBack: rawTempBack ?? tempOut,
    tempBackInferred: rawTempBack === null && tempOut !== null,
    feelingOut: normalizedFeeling(property(page, dp.feelingOut)),
    feelingBack: normalizedFeeling(property(page, dp.feelingBack)),
    rainCondition: 'unknown',
    longWalkCondition: 'unknown',
    place: optionValue(property(page, dp.place)),
    transport: optionValue(property(page, dp.transport)),
    memo: textValue(property(page, dp.memo)),
    notionCreatedAt: page.created_time,
  })
}

const replacementLines = []
for (const page of replacementPages) {
  replacementLines.push({
    id: page.id,
    notionPageId: page.id,
    name: textValue(property(page, rp.name)),
    styleIdentity:
      optionValue(property(page, rp.styleIdentity)) ??
      textValue(property(page, rp.styleIdentity)),
    itemIds: await relationValue(page, rp.items),
    notionCreatedAt: page.created_time,
  })
}

const colorIcons = [
  ...new Map(
    wardrobePages
      .map(iconValue)
      .filter(Boolean)
      .map((icon) => [icon.id, icon]),
  ).values(),
].sort((a, b) => a.id.localeCompare(b.id))

const itemIds = new Set(items.map((item) => item.id))
const outfitIds = new Set(outfits.map((outfit) => outfit.id))
const report = {
  counts: {
    items: items.length,
    outfits: outfits.length,
    wearLogs: wearLogs.length,
    replacementLines: replacementLines.length,
    colorIcons: colorIcons.length,
  },
  unresolved: {
    itemName: items.filter((item) => !item.name).map((item) => item.id),
    itemCategory: items.filter((item) => !item.category).map((item) => item.id),
    itemColorIcon: items.filter((item) => !item.notionIconId).map((item) => item.id),
    outfitItems: outfits.filter((outfit) => outfit.itemIds.length === 0).map((outfit) => outfit.id),
    brokenOutfitItems: outfits.flatMap((outfit) =>
      outfit.itemIds
        .filter((id) => !itemIds.has(id))
        .map((id) => ({ outfitId: outfit.id, itemId: id })),
    ),
    wearLogDate: wearLogs.filter((log) => !log.wornOn).map((log) => log.id),
    wearLogOutfit: wearLogs.filter((log) => !log.outfitId).map((log) => log.id),
    brokenWearLogOutfit: wearLogs
      .filter((log) => log.outfitId && !outfitIds.has(log.outfitId))
      .map((log) => ({ wearLogId: log.id, outfitId: log.outfitId })),
    wearLogTempOut: wearLogs.filter((log) => log.tempOut === null).map((log) => log.id),
    replacementItems: replacementLines
      .filter((line) => line.itemIds.length === 0)
      .map((line) => line.id),
    replacementStyleIdentity: replacementLines
      .filter((line) => !line.styleIdentity)
      .map((line) => line.id),
  },
}

const snapshot = {
  metadata: {
    extractedAt: new Date().toISOString(),
    notionApiVersion: notionVersion,
    dataSources: config.dataSources,
  },
  report,
  colorIcons,
  items,
  outfits,
  wearLogs,
  replacementLines,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ outputPath, ...report }, null, 2))
