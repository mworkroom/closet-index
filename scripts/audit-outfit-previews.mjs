import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'
const BUCKET = 'closet-images'

function argument(argv, name, fallback = null) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : fallback
}

function required(value, message) {
  if (!value) throw new Error(message)
  return value
}

async function collectRows(queryFactory) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await queryFactory(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 1000) return rows
  }
}

async function collectObjects(bucket, prefix) {
  const objects = []
  const directories = [prefix]
  while (directories.length > 0) {
    const directory = directories.pop()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list(directory, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw error
      for (const entry of data ?? []) {
        const entryPath = `${directory}/${entry.name}`
        if (entry.id) objects.push(entryPath)
        else directories.push(entryPath)
      }
      if (!data || data.length < 1000) break
    }
  }
  return objects
}

export function classifyPreviewAudit({ previews, outfitIds, objectPaths }) {
  const metadataPaths = new Set(previews.map((preview) => preview.storage_path))
  const objects = new Set(objectPaths)
  return {
    metadataCount: previews.length,
    objectCount: objectPaths.length,
    readyCount: previews.filter((preview) => preview.status === 'ready').length,
    pendingCount: previews.filter((preview) => preview.status === 'pending').length,
    errorCount: previews.filter((preview) => preview.status === 'error').length,
    staleCount: previews.filter((preview) => Boolean(preview.stale_at)).length,
    orphanMetadata: previews
      .filter((preview) => !outfitIds.has(preview.outfit_id))
      .map((preview) => preview.storage_path),
    missingReadyObjects: previews
      .filter(
        (preview) =>
          preview.status === 'ready' && !objects.has(preview.storage_path),
      )
      .map((preview) => preview.storage_path),
    orphanObjects: objectPaths.filter((objectPath) => !metadataPaths.has(objectPath)),
  }
}

export async function run(argv = process.argv) {
  const envFile = path.resolve(
    argument(argv, '--env-file', '.env.supabase.local'),
  )
  if (existsSync(envFile)) process.loadEnvFile(envFile)
  const supabaseUrl = required(
    process.env.SUPABASE_URL,
    'SUPABASE_URL 환경값이 필요합니다.',
  ).replace(/\/$/, '')
  if (new URL(supabaseUrl).hostname !== `${EXPECTED_PROJECT_REF}.supabase.co`) {
    throw new Error(`점검 대상은 mworkroom 프로젝트(${EXPECTED_PROJECT_REF})여야 합니다.`)
  }
  const secretKey = required(
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    'SUPABASE_SECRET_KEY 환경값이 필요합니다.',
  )
  const workspaceId = required(
    argument(argv, '--workspace-id'),
    '--workspace-id 값이 필요합니다.',
  )
  const client = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const [previews, outfits, objectPaths] = await Promise.all([
    collectRows((from, to) =>
      client
        .from('closet_outfit_previews')
        .select('id,outfit_id,storage_path,status,stale_at,composition_version')
        .eq('workspace_id', workspaceId)
        .range(from, to),
    ),
    collectRows((from, to) =>
      client
        .from('closet_outfits')
        .select('id')
        .eq('workspace_id', workspaceId)
        .range(from, to),
    ),
    collectObjects(
      client.storage.from(BUCKET),
      `${workspaceId}/outfits`,
    ),
  ])

  const report = {
    projectRef: EXPECTED_PROJECT_REF,
    workspaceId,
    checkedAt: new Date().toISOString(),
    ...classifyPreviewAudit({
      previews,
      outfitIds: new Set(outfits.map((outfit) => outfit.id)),
      objectPaths,
    }),
  }
  console.log(JSON.stringify(report, null, 2))
  return report
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url

if (isMain) await run()
