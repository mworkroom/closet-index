import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'

const [distArgument = 'dist', baseArgument = '/closet-index/'] = process.argv.slice(2)
const distDirectory = resolve(distArgument)
const basePath = `/${baseArgument.replace(/^\/+|\/+$/g, '')}/`

function assertContract(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath]
  })
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

assertContract(existsSync(distDirectory), `Build directory not found: ${distDirectory}`)

const requiredFiles = [
  'index.html',
  '404.html',
  'manifest.webmanifest',
  'sw.js',
]

for (const requiredFile of requiredFiles) {
  assertContract(
    existsSync(join(distDirectory, requiredFile)),
    `Required Pages artifact is missing: ${requiredFile}`,
  )
}

const files = listFiles(distDirectory)
const workboxFiles = files.filter((filePath) => /^workbox-.*\.js$/.test(basename(filePath)))
assertContract(workboxFiles.length > 0, 'Generated Workbox runtime is missing')

const indexContents = readFileSync(join(distDirectory, 'index.html'))
const fallbackContents = readFileSync(join(distDirectory, '404.html'))
assertContract(
  sha256(indexContents) === sha256(fallbackContents),
  '404.html must be an exact copy of index.html for SPA routing',
)

const indexHtml = indexContents.toString('utf8')
assertContract(
  indexHtml.includes(`${basePath}assets/`),
  `Built asset references do not use the expected Pages base path: ${basePath}`,
)
assertContract(
  indexHtml.includes(`${basePath}manifest.webmanifest`),
  `Manifest link does not use the expected Pages base path: ${basePath}`,
)

const localReferences = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => reference.startsWith(basePath) && reference !== basePath)

const missingReferences = localReferences.filter((reference) => {
  const artifactPath = join(
    distDirectory,
    ...decodeURIComponent(reference.slice(basePath.length)).split('/'),
  )
  return !existsSync(artifactPath) || !statSync(artifactPath).isFile()
})

assertContract(
  missingReferences.length === 0,
  `Built HTML contains missing local references: ${missingReferences.join(', ')}`,
)

const manifest = JSON.parse(
  readFileSync(join(distDirectory, 'manifest.webmanifest'), 'utf8'),
)
assertContract(manifest.name === 'Closet Index', 'Unexpected PWA manifest name')
assertContract(manifest.display === 'standalone', 'PWA display mode must be standalone')
assertContract(manifest.start_url === '.', 'PWA start_url must stay relative to the Pages base')
assertContract(manifest.scope === '.', 'PWA scope must stay relative to the Pages base')
assertContract(manifest.lang === 'ko', 'PWA manifest language must be Korean')
assertContract(
  Array.isArray(manifest.icons) && manifest.icons.length >= 2,
  'PWA manifest must include the SVG and Apple touch icons',
)

const forbiddenPatterns = [
  'SUPABASE_SECRET_KEY',
  'service_role',
  'assets/private',
  '.env.local',
  '.env.supabase',
  'C:\\Users\\',
]
const forbiddenMatches = []

for (const filePath of files) {
  const contents = readFileSync(filePath).toString('utf8')
  for (const pattern of forbiddenPatterns) {
    if (contents.includes(pattern)) {
      forbiddenMatches.push(`${relative(distDirectory, filePath)}: ${pattern}`)
    }
  }
}

assertContract(
  forbiddenMatches.length === 0,
  `Pages artifact contains local-only or secret-bearing text: ${forbiddenMatches.join(', ')}`,
)

console.log(JSON.stringify({
  artifactDirectory: distDirectory,
  basePath,
  referencedFiles: localReferences.length,
  workboxFiles: workboxFiles.length,
  indexAnd404Sha256: sha256(indexContents),
  manifest: {
    name: manifest.name,
    display: manifest.display,
    start_url: manifest.start_url,
    scope: manifest.scope,
    lang: manifest.lang,
    icons: manifest.icons.length,
  },
  forbiddenMatches: 0,
}, null, 2))
