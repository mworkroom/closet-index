import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { composeOutfitPreview } from "./compose-outfit-preview.mjs";
import { stableUuid } from "./prepare-image-upload.mjs";

const EXPECTED_PROJECT_REF = "ddlwainwollvpaeccpty";
const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000003";
const DEFAULT_BUCKET = "closet-images";
const DEFAULT_MANIFEST =
  "assets/private/phase-1b/batch-0-manifest.json";

function argument(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
}

function invariant(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function adminHeaders(adminKey, contentType) {
  const headers = { apikey: adminKey };
  if (contentType) headers["Content-Type"] = contentType;
  if (!adminKey.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${adminKey}`;
  }
  return headers;
}

function encodedStoragePath(storagePath) {
  return storagePath.split("/").map(encodeURIComponent).join("/");
}

export function createPreviewAssetPlan({
  workspaceId,
  outfitId,
  compositionVersion,
}) {
  return {
    id: stableUuid(
      `closet-index:${workspaceId}:outfit:${outfitId}:` +
        `preview:v${compositionVersion}`,
    ),
    storagePath:
      `${workspaceId}/outfits/${outfitId}/preview/` +
      `v${compositionVersion}.webp`,
  };
}

export function decidePreviewAction({
  existingMetadata,
  existingObjectSha256,
  expectedSha256,
}) {
  if (existingMetadata?.status === "ready") {
    invariant(
      existingObjectSha256,
      "ready preview의 Storage object가 없습니다.",
    );
    invariant(
      existingObjectSha256 === expectedSha256,
      "같은 composition version의 ready preview 내용이 다릅니다. " +
        "기존 preview를 덮어쓰지 말고 version을 올리세요.",
    );
    return "unchanged";
  }
  if (existingObjectSha256) {
    invariant(
      existingObjectSha256 === expectedSha256,
      "metadata가 없는 같은 경로에 다른 preview가 있습니다. " +
        "composition version을 올리세요.",
    );
    return "metadata-only";
  }
  return "upload";
}

async function fetchJson(url, adminKey) {
  const response = await fetch(url, {
    headers: adminHeaders(adminKey),
  });
  if (!response.ok) {
    throw new Error(
      `원격 검증 실패 ${response.status}: ${await response.text()}`,
    );
  }
  return response.json();
}

async function verifyRemoteInputs({
  supabaseUrl,
  adminKey,
  workspaceId,
  manifest,
}) {
  const outfits = await fetchJson(
    `${supabaseUrl}/rest/v1/closet_outfits` +
      `?workspace_id=eq.${workspaceId}` +
      `&id=eq.${manifest.outfit.uuid}&select=id`,
    adminKey,
  );
  invariant(outfits.length === 1, "원격 Outfit을 찾을 수 없습니다.");

  const relations = await fetchJson(
    `${supabaseUrl}/rest/v1/closet_outfit_items` +
      `?workspace_id=eq.${workspaceId}` +
      `&outfit_id=eq.${manifest.outfit.uuid}&select=item_id`,
    adminKey,
  );
  const relationIds = new Set(relations.map((row) => row.item_id));
  const manifestIds = new Set(manifest.items.map((item) => item.uuid));
  invariant(
    relationIds.size === manifestIds.size &&
      [...manifestIds].every((id) => relationIds.has(id)),
    "manifest Item과 원격 Outfit relation이 정확히 일치하지 않습니다.",
  );

  const itemIds = manifest.items.map((item) => item.uuid).join(",");
  const cutouts = await fetchJson(
    `${supabaseUrl}/rest/v1/closet_item_images` +
      `?workspace_id=eq.${workspaceId}` +
      `&item_id=in.(${itemIds})&variant=eq.cutout&status=eq.ready` +
      `&select=item_id,storage_path`,
    adminKey,
  );
  const cutoutIds = new Set(cutouts.map((row) => row.item_id));
  invariant(
    cutoutIds.size === manifestIds.size &&
      [...manifestIds].every((id) => cutoutIds.has(id)),
    "모든 manifest Item의 ready cutout metadata가 필요합니다.",
  );
}

async function downloadObject({
  supabaseUrl,
  adminKey,
  bucket,
  storagePath,
}) {
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/authenticated/` +
      `${encodeURIComponent(bucket)}/${encodedStoragePath(storagePath)}`,
    { headers: adminHeaders(adminKey) },
  );
  if (response.status === 400 || response.status === 404) return null;
  if (!response.ok) {
    throw new Error(
      `기존 preview 확인 실패 ${response.status}: ${await response.text()}`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
}

async function uploadObject({
  supabaseUrl,
  adminKey,
  bucket,
  storagePath,
  buffer,
}) {
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/` +
      encodedStoragePath(storagePath),
    {
      method: "POST",
      headers: {
        ...adminHeaders(adminKey, "image/webp"),
        "cache-control": "3600",
      },
      body: buffer,
    },
  );
  if (!response.ok) {
    throw new Error(
      `preview 업로드 실패 ${response.status}: ${await response.text()}`,
    );
  }
}

async function upsertMetadata({
  supabaseUrl,
  adminKey,
  row,
}) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/closet_outfit_previews?on_conflict=id`,
    {
      method: "POST",
      headers: {
        ...adminHeaders(adminKey, "application/json"),
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    },
  );
  if (!response.ok) {
    throw new Error(
      `preview metadata upsert 실패 ${response.status}: ` +
        `${await response.text()}`,
    );
  }
}

export async function run(argv = process.argv) {
  const manifestPath = path.resolve(
    argument(argv, "--manifest", DEFAULT_MANIFEST),
  );
  const apply = argv.includes("--apply");
  const workspaceId = argument(
    argv,
    "--workspace-id",
    DEFAULT_WORKSPACE_ID,
  );
  const bucket = argument(argv, "--bucket", DEFAULT_BUCKET);
  const envFilePath = path.resolve(
    argument(argv, "--env-file", ".env.supabase.local"),
  );
  const composition = await composeOutfitPreview({ manifestPath });
  const { report, manifest, paths } = composition;
  const previewBuffer = await readFile(paths.previewOutput);
  invariant(
    report.preview.width === 900 && report.preview.height === 1200,
    "preview는 900x1200이어야 합니다.",
  );
  invariant(
    sha256(previewBuffer) === report.preview.sha256,
    "preview 파일 hash가 합성 보고서와 다릅니다.",
  );
  const asset = createPreviewAssetPlan({
    workspaceId,
    outfitId: manifest.outfit.uuid,
    compositionVersion: report.compositionVersion,
  });
  let action = "dry-run";

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
    await verifyRemoteInputs({
      supabaseUrl,
      adminKey,
      workspaceId,
      manifest,
    });
    const metadataRows = await fetchJson(
      `${supabaseUrl}/rest/v1/closet_outfit_previews` +
        `?workspace_id=eq.${workspaceId}` +
        `&outfit_id=eq.${manifest.outfit.uuid}` +
        `&composition_version=eq.${report.compositionVersion}` +
        `&select=id,storage_path,status,width_px,height_px`,
      adminKey,
    );
    invariant(metadataRows.length <= 1, "preview metadata가 중복됐습니다.");
    const existingObject = await downloadObject({
      supabaseUrl,
      adminKey,
      bucket,
      storagePath: asset.storagePath,
    });
    action = decidePreviewAction({
      existingMetadata: metadataRows[0] ?? null,
      existingObjectSha256: existingObject
        ? sha256(existingObject)
        : null,
      expectedSha256: report.preview.sha256,
    });
    if (action === "upload") {
      await uploadObject({
        supabaseUrl,
        adminKey,
        bucket,
        storagePath: asset.storagePath,
        buffer: previewBuffer,
      });
      const uploaded = await downloadObject({
        supabaseUrl,
        adminKey,
        bucket,
        storagePath: asset.storagePath,
      });
      invariant(
        uploaded && sha256(uploaded) === report.preview.sha256,
        "업로드한 preview hash 검증에 실패했습니다.",
      );
    }
    if (action !== "unchanged") {
      await upsertMetadata({
        supabaseUrl,
        adminKey,
        row: {
          id: asset.id,
          workspace_id: workspaceId,
          outfit_id: manifest.outfit.uuid,
          storage_path: asset.storagePath,
          status: "ready",
          composition_version: report.compositionVersion,
          width_px: report.preview.width,
          height_px: report.preview.height,
          updated_at: new Date().toISOString(),
        },
      });
    }
  }

  const uploadReport = {
    mode: apply ? "apply" : "dry-run",
    action,
    projectRef: EXPECTED_PROJECT_REF,
    workspaceId,
    bucket,
    outfitId: manifest.outfit.uuid,
    compositionVersion: report.compositionVersion,
    inputFingerprint: report.inputFingerprint,
    preview: {
      storagePath: asset.storagePath,
      width: report.preview.width,
      height: report.preview.height,
      bytes: report.preview.bytes,
      sha256: report.preview.sha256,
      warnings: report.validation.warnings,
    },
    guarantees: {
      readyPreviewOverwrite: false,
      metadataReadyAfterObjectHashVerification: true,
      sourceFilesTrackedByGit: false,
    },
  };
  const uploadReportPath = path.join(
    path.dirname(paths.reportOutput),
    `${path.parse(paths.previewOutput).name}-upload-report.json`,
  );
  await writeFile(
    uploadReportPath,
    `${JSON.stringify(uploadReport, null, 2)}\n`,
  );
  console.log(
    JSON.stringify(
      {
        mode: uploadReport.mode,
        action: uploadReport.action,
        outfitId: uploadReport.outfitId,
        compositionVersion: uploadReport.compositionVersion,
        preview: uploadReport.preview,
        uploadReportPath,
      },
      null,
      2,
    ),
  );
  return uploadReport;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  await run();
}
