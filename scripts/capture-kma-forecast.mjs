import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ENV_PATH = path.join(ROOT, 'supabase', 'functions', '.env')
const OUTPUT_DIR = path.join(
  ROOT,
  'supabase',
  'functions',
  'fixtures',
  'live',
)
const ENDPOINT =
  'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const RELEASE_DELAY_MS = 10 * 60 * 1000
const BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23]
const PAGE_SIZE = 1000
const MAX_RESPONSE_BYTES = 1024 * 1024

function parseEnv(text) {
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    if (separator < 1) continue
    const name = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    values[name] = value
  }
  return values
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatDate(timestamp) {
  const shifted = new Date(timestamp + KST_OFFSET_MS)
  return [
    shifted.getUTCFullYear(),
    pad2(shifted.getUTCMonth() + 1),
    pad2(shifted.getUTCDate()),
  ].join('')
}

function selectBaseTime(now = new Date()) {
  const nowTimestamp = now.getTime()
  let latest = null

  for (const dayOffset of [-1, 0]) {
    const shifted = new Date(
      nowTimestamp + KST_OFFSET_MS + dayOffset * 24 * 60 * 60 * 1000,
    )
    const year = shifted.getUTCFullYear()
    const month = shifted.getUTCMonth()
    const day = shifted.getUTCDate()

    for (const hour of BASE_HOURS) {
      const issuedTimestamp =
        Date.UTC(year, month, day, hour, 0, 0) - KST_OFFSET_MS
      if (issuedTimestamp + RELEASE_DELAY_MS > nowTimestamp) continue
      if (!latest || issuedTimestamp > latest.issuedTimestamp) {
        latest = {
          baseDate: formatDate(issuedTimestamp),
          baseTime: `${pad2(hour)}00`,
          issuedTimestamp,
        }
      }
    }
  }

  if (!latest) throw new Error('사용 가능한 단기예보 발표시각이 없습니다.')
  return latest
}

function keyFormat(key, configured) {
  if (configured === 'decoded' || configured === 'encoded') return configured
  return /%[0-9a-f]{2}/i.test(key) ? 'encoded' : 'decoded'
}

function buildUrl({
  serviceKey,
  format,
  baseDate,
  baseTime,
  nx,
  ny,
  pageNo,
}) {
  const params = new URLSearchParams({
    numOfRows: String(PAGE_SIZE),
    pageNo: String(pageNo),
    dataType: 'JSON',
    base_date: baseDate,
    base_time: baseTime,
    nx: String(nx),
    ny: String(ny),
  })

  if (format === 'encoded') {
    return `${ENDPOINT}?serviceKey=${serviceKey}&${params.toString()}`
  }

  params.set('serviceKey', serviceKey)
  return `${ENDPOINT}?${params.toString()}`
}

async function fetchPage(options) {
  const response = await fetch(buildUrl(options), {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/json' },
  })

  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error('기상청 응답 크기가 안전 상한을 초과했습니다.')
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error('기상청 응답 크기가 안전 상한을 초과했습니다.')
  }

  let payload
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new Error(
      '기상청이 JSON이 아닌 응답을 반환했습니다. 인증키 형식을 확인해야 합니다.',
    )
  }

  const resultCode = String(payload?.response?.header?.resultCode ?? '')
  if (resultCode !== '00' && resultCode !== '0') {
    throw new Error(`기상청 API 오류 코드: ${resultCode || 'unknown'}`)
  }

  const body = payload?.response?.body
  const items = body?.items?.item
  if (!body || !Array.isArray(items)) {
    throw new Error('기상청 단기예보 응답에 예보 항목이 없습니다.')
  }

  return { payload, body, items }
}

async function main() {
  let envText
  try {
    envText = await fs.readFile(ENV_PATH, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        'supabase/functions/.env 파일이 없습니다. .env.example을 복사한 뒤 인증키를 로컬에서 입력해야 합니다.',
      )
    }
    throw error
  }

  const env = parseEnv(envText)
  const serviceKey = env.KMA_SERVICE_KEY
  if (!serviceKey) {
    throw new Error('supabase/functions/.env의 KMA_SERVICE_KEY가 비어 있습니다.')
  }

  const nx = Number(env.KMA_NX || 61)
  const ny = Number(env.KMA_NY || 129)
  if (!Number.isInteger(nx) || nx <= 0 || !Number.isInteger(ny) || ny <= 0) {
    throw new Error('KMA_NX와 KMA_NY는 양의 정수여야 합니다.')
  }

  const base = selectBaseTime()
  const format = keyFormat(serviceKey, env.KMA_SERVICE_KEY_FORMAT)
  const request = {
    serviceKey,
    format,
    baseDate: base.baseDate,
    baseTime: base.baseTime,
    nx,
    ny,
  }

  const first = await fetchPage({ ...request, pageNo: 1 })
  const totalCount = Number(first.body.totalCount)
  if (!Number.isInteger(totalCount) || totalCount < first.items.length) {
    throw new Error('기상청 응답의 totalCount 값이 올바르지 않습니다.')
  }
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const allItems = [...first.items]

  for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
    const page = await fetchPage({ ...request, pageNo })
    allItems.push(...page.items)
  }

  const fixture = structuredClone(first.payload)
  fixture.response.body.items.item = allItems
  fixture.response.body.numOfRows = allItems.length
  fixture.response.body.pageNo = 1
  fixture.response.body.totalCount = totalCount

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  const filename = `kma-vilage-${base.baseDate}-${base.baseTime}-${nx}-${ny}.json`
  const outputPath = path.join(OUTPUT_DIR, filename)
  await fs.writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })

  console.log(
    `기상청 실응답 ${allItems.length}건을 Git 제외 경로에 저장했습니다: ${path.relative(
      ROOT,
      outputPath,
    )}`,
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '날씨 응답 저장 실패')
  process.exitCode = 1
})
