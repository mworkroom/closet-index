import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { encodeWebpToTarget } from "./encode-webp-to-target.mjs";

const EXPECTED_PROJECT_REF = "ddlwainwollvpaeccpty";
const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000003";
const DEFAULT_BUCKET = "closet-images";
const DEFAULT_MANIFEST =
  "assets/private/phase-1b/batch-0-manifest.json";
const ALLOWED_INPUT_FORMATS = new Set(["png", "jpeg", "webp", "heif"]);
const CUTOUT_TARGET_MAX_BYTES = 500 * 1024;
const CUTOUT_HARD_MAX_BYTES = 700 * 1024;
const CUTOUT_ENCODING_CANDIDATES = [
  { maxDimension: 1600, quality: 90 },
  { maxDimension: 1600, quality: 80 },
  { maxDimension: 1400, quality: 74 },
  { maxDimension: 1200, quality: 68 },
  { maxDimension: 1000, quality: 60 },
  { maxDimension: 900, quality: 52 },
];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function invariant(value, message) {
  if (!value) throw new Error(message);
  return value;
}

export function stableUuid(value) {
  const bytes = Buffer.from(
    createHash("sha256").update(value).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function resolveManifestInput(inputDirectory, filename) {
  const root = path.resolve(inputDirectory);
  const resolved = path.resolve(root, filename);
  invariant(
    resolved.startsWith(`${root}${path.sep}`),
    `입력 파일이 manifest inputDirectory 밖을 가리킵니다: ${filename}`,
  );
  return resolved;
}

export function createAssetPlan({ workspaceId, itemId }) {
  const cutoutId = stableUuid(
    `closet-index:${workspaceId}:item:${itemId}:cutout`,
  );
  return {
    cutout: {
      id: cutoutId,
      variant: "cutout",
      storagePath:
        `${workspaceId}/items/${itemId}/cutout/${cutoutId}.webp`,
    },
  };
}

export function manifestOutfitIds(manifest) {
  const legacyOutfitIds = manifest.outfit?.uuid
    ? [manifest.outfit.uuid]
    : [];
  const batchOutfitIds = Array.isArray(manifest.outfits)
    ? manifest.outfits.map((outfit) => outfit.uuid)
    : [];
  return [...new Set([...legacyOutfitIds, ...batchOutfitIds])];
}

export function validateManifest(manifest, workspaceId) {
  invariant(manifest.version === 1, "지원하지 않는 manifest version입니다.");
  invariant(
    UUID_PATTERN.test(workspaceId),
    `workspace UUID 형식이 잘못되었습니다: ${workspaceId}`,
  );
  const outfitIds = manifestOutfitIds(manifest);
  invariant(
    outfitIds.length > 0,
    "manifest outfit 또는 outfits UUID가 필요합니다.",
  );
  for (const outfitId of outfitIds) {
    invariant(
      UUID_PATTERN.test(outfitId),
      `Outfit UUID 형식이 잘못되었습니다: ${outfitId}`,
    );
  }
  invariant(
    Array.isArray(manifest.items) && manifest.items.length > 0,
    "manifest items가 비어 있습니다.",
  );

  const ids = new Set();
  const filenames = new Set();
  for (const item of manifest.items) {
    invariant(
      UUID_PATTERN.test(item.uuid ?? ""),
      `Item UUID 형식이 잘못되었습니다: ${item.name ?? "이름 없음"}`,
    );
    invariant(item.name?.trim(), `Item ${item.uuid}의 이름이 필요합니다.`);
    invariant(
      item.category?.trim(),
      `Item ${item.name}의 category가 필요합니다.`,
    );
    invariant(
      item.filename?.trim(),
      `Item ${item.name}의 filename이 필요합니다.`,
    );
    invariant(!ids.has(item.uuid), `중복 Item UUID입니다: ${item.uuid}`);
    invariant(
      !filenames.has(item.filename),
      `중복 입력 파일명입니다: ${item.filename}`,
    );
    ids.add(item.uuid);
    filenames.add(item.filename);
  }
}

export async function prepareItem({
  item,
  inputDirectory,
  preparedDirectory,
  workspaceId,
  alphaThreshold,
}) {
  const inputPath = resolveManifestInput(inputDirectory, item.filename);
  invariant(existsSync(inputPath), `입력 파일이 없습니다: ${item.filename}`);

  const source = sharp(inputPath).rotate().ensureAlpha();
  const metadata = await source.clone().metadata();
  invariant(
    ALLOWED_INPUT_FORMATS.has(metadata.format),
    `${item.name}: 지원하지 않는 형식 ${metadata.format ?? "unknown"}`,
  );
  invariant(
    Number.isInteger(metadata.width) &&
      metadata.width > 0 &&
      Number.isInteger(metadata.height) &&
      metadata.height > 0,
    `${item.name}: 이미지 크기를 읽을 수 없습니다.`,
  );

  const stats = await source.clone().stats();
  const alpha = stats.channels[3];
  invariant(alpha.max > alphaThreshold, `${item.name}: 투명 영역뿐입니다.`);
  invariant(
    alpha.min < 255,
    `${item.name}: 투명 배경이 없는 이미지입니다.`,
  );

  const trimmed = await source
    .clone()
    .trim({
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      threshold: alphaThreshold,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const safetyMargin = Math.max(
    2,
    Math.round(Math.max(trimmed.info.width, trimmed.info.height) * 0.025),
  );
  const padded = await sharp(trimmed.data)
    .extend({
      top: safetyMargin,
      right: safetyMargin,
      bottom: safetyMargin,
      left: safetyMargin,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const cutout = await encodeWebpToTarget(padded, {
    targetMaxBytes: CUTOUT_TARGET_MAX_BYTES,
    candidates: CUTOUT_ENCODING_CANDIDATES,
    alphaQuality: 100,
    effort: 6,
  });
  invariant(
    cutout.data.byteLength <= CUTOUT_HARD_MAX_BYTES,
    `${item.name}: cutout이 자동 압축 후에도 700KB를 초과합니다: ` +
      `${Math.round(cutout.data.byteLength / 1024)}KB`,
  );

  const assets = createAssetPlan({
    workspaceId,
    itemId: item.uuid,
  });
  const cutoutFile = path.join(
    preparedDirectory,
    `${item.uuid}__cutout.webp`,
  );
  await writeFile(cutoutFile, cutout.data);

  const warnings = [];
  if (!cutout.targetMet) {
    warnings.push(
      `cutout이 500KB 목표를 초과하지만 700KB 제한 이내입니다: ` +
        `${Math.round(cutout.data.byteLength / 1024)}KB`,
    );
  }

  return {
    itemId: item.uuid,
    name: item.name,
    category: item.category,
    input: {
      filename: item.filename,
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      bytes: (await readFile(inputPath)).byteLength,
    },
    assets: [
      {
        ...assets.cutout,
        localPath: cutoutFile,
        contentType: "image/webp",
        width: cutout.info.width,
        height: cutout.info.height,
        bytes: cutout.data.byteLength,
        encoding: cutout.encoding,
      },
    ],
    warnings,
  };
}

function adminHeaders(adminKey, contentType) {
  const headers = {
    apikey: adminKey,
  };
  if (contentType) headers["Content-Type"] = contentType;
  if (!adminKey.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${adminKey}`;
  }
  return headers;
}

function encodedStoragePath(storagePath) {
  return storagePath.split("/").map(encodeURIComponent).join("/");
}

export async function verifyRemoteItems({
  supabaseUrl,
  adminKey,
  workspaceId,
  manifest,
}) {
  const itemIds = manifest.items.map((item) => item.uuid).join(",");
  const itemResponse = await fetch(
    `${supabaseUrl}/rest/v1/closet_items` +
      `?workspace_id=eq.${workspaceId}` +
      `&id=in.(${itemIds})&select=id,name,category`,
    { headers: adminHeaders(adminKey) },
  );
  if (!itemResponse.ok) {
    throw new Error(
      `Item 검증 실패 ${itemResponse.status}: ${await itemResponse.text()}`,
    );
  }
  const remoteItems = await itemResponse.json();
  const remoteById = new Map(remoteItems.map((item) => [item.id, item]));
  for (const item of manifest.items) {
    const remote = remoteById.get(item.uuid);
    invariant(remote, `원격 Item이 없습니다: ${item.name} (${item.uuid})`);
    invariant(
      remote.name === item.name,
      `Item명이 다릅니다: manifest=${item.name}, remote=${remote.name}`,
    );
    invariant(
      remote.category === item.category,
      `${item.name} category가 다릅니다: ` +
        `manifest=${item.category}, remote=${remote.category}`,
    );
  }
}

async function verifyRemoteRelations({
  supabaseUrl,
  adminKey,
  workspaceId,
  manifest,
}) {
  const outfitIds = manifestOutfitIds(manifest);
  await verifyRemoteItems({
    supabaseUrl,
    adminKey,
    workspaceId,
    manifest,
  });

  const relationResponse = await fetch(
    `${supabaseUrl}/rest/v1/closet_outfit_items` +
      `?workspace_id=eq.${workspaceId}` +
      `&outfit_id=in.(${outfitIds.join(",")})&select=outfit_id,item_id`,
    { headers: adminHeaders(adminKey) },
  );
  if (!relationResponse.ok) {
    throw new Error(
      `Outfit relation 검증 실패 ${relationResponse.status}: ` +
        `${await relationResponse.text()}`,
    );
  }
  const relationIds = new Set(
    (await relationResponse.json()).map((row) => row.item_id),
  );
  for (const item of manifest.items) {
    invariant(
      relationIds.has(item.uuid),
      `${item.name}은 manifest Outfit의 원격 relation에 없습니다.`,
    );
  }
}

async function uploadObject({
  supabaseUrl,
  adminKey,
  bucket,
  asset,
}) {
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/` +
      encodedStoragePath(asset.storagePath),
    {
      method: "POST",
      headers: {
        ...adminHeaders(adminKey, asset.contentType),
        "x-upsert": "true",
      },
      body: await readFile(asset.localPath),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Storage 업로드 실패 ${response.status} (${asset.storagePath}): ` +
        `${await response.text()}`,
    );
  }
}

async function upsertMetadata({
  supabaseUrl,
  adminKey,
  workspaceId,
  preparedItems,
}) {
  const rows = preparedItems.flatMap((item) =>
    item.assets.map((asset) => ({
      id: asset.id,
      workspace_id: workspaceId,
      item_id: item.itemId,
      storage_path: asset.storagePath,
      variant: asset.variant,
      status: "ready",
      width_px: asset.width,
      height_px: asset.height,
      updated_at: new Date().toISOString(),
    })),
  );
  const response = await fetch(
    `${supabaseUrl}/rest/v1/closet_item_images?on_conflict=id`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(adminKey, "application/json"),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    },
  );
  if (!response.ok) {
    throw new Error(
      `metadata upsert 실패 ${response.status}: ${await response.text()}`,
    );
  }
}

export async function run(argv = process.argv) {
  process.argv = argv;
  const manifestPath = path.resolve(
    argument("--manifest", DEFAULT_MANIFEST),
  );
  const apply = hasFlag("--apply");
  const workspaceId = argument("--workspace-id", DEFAULT_WORKSPACE_ID);
  const bucket = argument("--bucket", DEFAULT_BUCKET);
  const envFilePath = path.resolve(
    argument("--env-file", ".env.supabase.local"),
  );
  const manifestDirectory = path.dirname(manifestPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  validateManifest(manifest, workspaceId);
  const outfitIds = manifestOutfitIds(manifest);

  const inputDirectory = path.resolve(
    manifestDirectory,
    manifest.inputDirectory ?? "input",
  );
  const preparedDirectory = path.resolve(
    manifestDirectory,
    manifest.preparedDirectory ?? "prepared",
  );
  await mkdir(preparedDirectory, { recursive: true });

  const preparedItems = [];
  for (const item of manifest.items) {
    preparedItems.push(
      await prepareItem({
        item,
        inputDirectory,
        preparedDirectory,
        workspaceId,
        alphaThreshold: manifest.alphaThreshold ?? 10,
      }),
    );
  }

  const report = {
    mode: apply ? "apply" : "dry-run",
    projectRef: EXPECTED_PROJECT_REF,
    workspaceId,
    bucket,
    manifest: path.basename(manifestPath),
    outfitId: outfitIds.length === 1 ? outfitIds[0] : null,
    outfitIds,
    counts: {
      items: preparedItems.length,
      assets: preparedItems.reduce(
        (count, item) => count + item.assets.length,
        0,
      ),
      warnings: preparedItems.reduce(
        (count, item) => count + item.warnings.length,
        0,
      ),
    },
    guarantees: {
      deleteExistingObjects: false,
      stableAssetIds: true,
      upsertSamePaths: true,
      metadataReadyAfterAllUploads: true,
      sourceFilesTrackedByGit: false,
      remoteOriginalUpload: false,
    },
    items: preparedItems,
  };

  if (apply) {
    if (existsSync(envFilePath)) process.loadEnvFile(envFilePath);
    const supabaseUrl = invariant(
      process.env.SUPABASE_URL,
      "적용에는 SUPABASE_URL 환경값이 필요합니다.",
    ).replace(/\/$/, "");
    invariant(
      new URL(supabaseUrl).hostname ===
        `${EXPECTED_PROJECT_REF}.supabase.co`,
      `적용 대상은 mworkroom 프로젝트(${EXPECTED_PROJECT_REF})여야 합니다.`,
    );
    const adminKey = invariant(
      process.env.SUPABASE_SECRET_KEY ??
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      "적용에는 SUPABASE_SECRET_KEY 환경값이 필요합니다.",
    );
    await verifyRemoteRelations({
      supabaseUrl,
      adminKey,
      workspaceId,
      manifest,
    });
    for (const item of preparedItems) {
      for (const asset of item.assets) {
        await uploadObject({ supabaseUrl, adminKey, bucket, asset });
      }
    }
    await upsertMetadata({
      supabaseUrl,
      adminKey,
      workspaceId,
      preparedItems,
    });
  }

  const reportPath = path.join(
    preparedDirectory,
    `${path.parse(manifestPath).name}-upload-report.json`,
  );
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        projectRef: report.projectRef,
        workspaceId: report.workspaceId,
        bucket: report.bucket,
        counts: report.counts,
        reportPath,
      },
      null,
      2,
    ),
  );
  return report;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  await run();
}
