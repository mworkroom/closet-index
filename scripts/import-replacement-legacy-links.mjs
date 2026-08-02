import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildReplacementLegacyLinkImportPlan } from './replacement-legacy-link-import-core.mjs'

const EXPECTED_PROJECT_REF = 'ddlwainwollvpaeccpty'
const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000003'

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

const snapshotPath = resolve(
  argument('--snapshot', 'data/notion-snapshot.json'),
)
const envFilePath = resolve(argument('--env-file', '.env.supabase.local'))
if (existsSync(envFilePath)) process.loadEnvFile(envFilePath)

const apply = hasFlag('--apply')
const workspaceId = process.env.IMPORT_WORKSPACE_ID ?? DEFAULT_WORKSPACE_ID
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
const importPlan = buildReplacementLegacyLinkImportPlan(
  snapshot,
  workspaceId,
)

console.log(
  JSON.stringify(
    {
      mode: apply ? 'apply' : 'dry-run',
      snapshotPath,
      sourceExtractedAt: snapshot.metadata?.extractedAt ?? null,
      targetWorkspaceId: workspaceId,
      blockers: importPlan.blockers,
      counts: importPlan.counts,
      guarantees: {
        targetTableOnly: 'closet_replacement_legacy_links',
        deleteExistingRows: false,
        overwriteReviewFields: false,
        automaticDirection: false,
      },
    },
    null,
    2,
  ),
)

if (!apply) {
  process.exitCode = importPlan.blockers.length > 0 ? 2 : 0
} else {
  invariant(
    importPlan.blockers.length === 0,
    `적용 차단 항목이 있습니다: ${importPlan.blockers.join(', ')}`,
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
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    '적용에는 SUPABASE_SECRET_KEY 환경값이 필요합니다.',
  )

  const headers = {
    apikey: adminKey,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates,return=minimal',
  }
  if (!adminKey.startsWith('sb_secret_')) {
    headers.Authorization = `Bearer ${adminKey}`
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/closet_replacement_legacy_links?on_conflict=${encodeURIComponent('workspace_id,item_a_id,item_b_id')}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(importPlan.rows),
    },
  )
  if (!response.ok) {
    throw new Error(
      `closet_replacement_legacy_links upsert ${response.status}: ${await response.text()}`,
    )
  }

  console.log('Replacement Legacy Link import completed.')
}
