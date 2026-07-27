import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const EXPECTED_PROJECT_REF = "ddlwainwollvpaeccpty";
const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000003";
const DEFAULT_BUCKET = "closet-images";
const DEFAULT_MANIFEST =
  "assets/private/phase-1b/batch-0-manifest.json";
const ALLOWED_INPUT_FORMATS = new Set(["png", "jpeg", "webp", "heif"]);
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

export function createAssetPlan({
  workspaceId,
  itemId,
  originalExtension = "png",
}) {
  const originalId = stableUuid(
    `closet-index:${workspaceId}:item:${itemId}:original`,
  );
  const cutoutId = stableUuid(
    `closet-index:${workspaceId}:item:${itemId}:cutout`,
  );
  return {
    original: {
      id: originalId,
      variant: "original",
      storagePath:
        `${workspaceId}/items/${itemId}/original/` +
        `${originalId}.${originalExtension}`,
    },
    cutout: {
      id: cutoutId,
      variant: "cutout",
      storagePath:
        `${workspaceId}/items/${itemId}/cutout/${cutoutId}.webp`,
    },
  };
}

function validateManifest(manifest, workspaceId) {
  invariant(manifest.version === 1, "지원하지 않는 manifest version입니다.");
  invariant(
    UUID_PATTERN.test(workspaceId),
    `workspace UUID 형식이 잘못되었습니다: ${workspaceId}`,
  );
  invariant(
    UUID_PATTERN.test(manifest.outfit?.uuid ?? ""),
    "manifest outfit UUID가 필요합니다.",
  );
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

async function prepareItem({
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

  const original = await source
    .clone()
    .resize({
      width: 4096,
      height: 4096,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer({ resolveWithObject: true });

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
  const cutout = await sharp(trimmed.data)
    .extend({
      top: safetyMargin,
      right: safetyMargin,
      bottom: safetyMargin,
      left: safetyMargin,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize({
      width: 1600,
      height: 1600,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer({ resolveWithObject: true });

  const assets = createAssetPlan({
    workspaceId,
    itemId: item.uuid,
  });
  const originalFile = path.join(
    preparedDirectory,
    `${item.uuid}__original.png`,
  );
  const cutoutFile = path.join(
    preparedDirectory,
    `${item.uuid}__cutout.webp`,
  );
  await Promise.all([
    writeFile(originalFile, original.data),
    writeFile(cutoutFile, cutout.data),
  ]);

  const warnings = [];
  if (cutout.data.byteLength > 700 * 1024) {
    warnings.push(
      `cutout이 초기 700KB 목표를 초과합니다: ` +
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
        ...assets.original,
        localPath: originalFile,
        contentType: "image/png",
        width: original.info.width,
        height: original.info.height,
        bytes: original.data.byteLength,
      },
      {
        ...assets.cutout,
        localPath: cutoutFile,
        contentType: "image/webp",
        width: cutout.info.width,
        height: cutout.info.height,
        bytes: cutout.data.byteLength,
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

async function verifyRemoteRelations({
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

  const relationResponse = await fetch(
    `${supabaseUrl}/rest/v1/closet_outfit_items` +
      `?workspace_id=eq.${workspaceId}` +
      `&outfit_id=eq.${manifest.outfit.uuid}&select=item_id`,
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
    outfitId: manifest.outfit.uuid,
    counts: {
      items: preparedItems.length,
      assets: preparedItems.length * 2,
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
