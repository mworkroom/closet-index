import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { analyzePhase5ContextEvidence } from './phase5-context-audit-core.mjs'

const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

function invariant(value, message) {
  if (!value) throw new Error(message)
  return value
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

const [wearLogRows, outfitRows] = await Promise.all([
  collectAll(
    'closet_wear_logs',
    'id,outfit_id,place_id,transport_mode_id,temp_out,temp_back,temp_back_inferred,feeling_out,feeling_back',
  ),
  collectAll('closet_outfits', 'id,rating'),
])

const audit = analyzePhase5ContextEvidence(
  wearLogRows.map((row) => ({
    id: row.id,
    outfitId: row.outfit_id,
    placeId: row.place_id,
    transportModeId: row.transport_mode_id,
    tempOut: row.temp_out,
    tempBack: row.temp_back,
    tempBackInferred: row.temp_back_inferred,
    feelingOut: row.feeling_out,
    feelingBack: row.feeling_back,
  })),
  outfitRows,
)

const report = {
  auditedAt: new Date().toISOString(),
  projectRef: EXPECTED_PROJECT_REF,
  queryStrategy: {
    fixedQueryStreams: 2,
    tables: ['closet_wear_logs', 'closet_outfits'],
    joinedRelationRows: false,
    networkNPlusOne: false,
    paginationPageSize: 1000,
  },
  ...audit,
}

const outputPath = argument('--output')
if (outputPath) {
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`)
}
console.log(JSON.stringify(report, null, 2))

