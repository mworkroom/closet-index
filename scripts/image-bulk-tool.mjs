import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  IMAGE_EXTENSIONS,
  suggestItemMatches,
  validateMappings,
} from "./image-bulk-core.mjs";
import {
  prepareItem,
  verifyRemoteItems,
} from "./prepare-image-upload.mjs";

const EXPECTED_PROJECT_REF = "ddlwainwollvpaeccpty";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000003";
const BUCKET = "closet-images";
const ROOT = path.resolve("assets/private/image-bulk");
const INBOX = path.join(ROOT, "inbox");
const PREPARED = path.join(ROOT, "prepared");
const STATE_PATH = path.join(ROOT, "mapping.json");
const ENV_PATH = path.resolve(".env.supabase.local");
const UI_PATH = path.resolve("scripts/image-bulk-tool.html");
const HOST = "127.0.0.1";
const PORT = Number(process.env.IMAGE_BULK_PORT ?? 4179);

function invariant(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function adminHeaders(adminKey) {
  const headers = { apikey: adminKey };
  if (!adminKey.startsWith("sb_secret_")) {
    headers.Authorization = `Bearer ${adminKey}`;
  }
  return headers;
}

function loadAdminContext() {
  if (existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);
  const supabaseUrl = invariant(
    process.env.SUPABASE_URL,
    ".env.supabase.local에 SUPABASE_URL이 필요합니다.",
  ).replace(/\/$/, "");
  invariant(
    new URL(supabaseUrl).hostname === `${EXPECTED_PROJECT_REF}.supabase.co`,
    `대상은 mworkroom 프로젝트(${EXPECTED_PROJECT_REF})여야 합니다.`,
  );
  const adminKey = invariant(
    process.env.SUPABASE_SECRET_KEY ??
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ".env.supabase.local에 SUPABASE_SECRET_KEY가 필요합니다.",
  );
  return { supabaseUrl, adminKey };
}

async function fetchJson(url, adminKey) {
  const response = await fetch(url, { headers: adminHeaders(adminKey) });
  if (!response.ok) {
    throw new Error(`Supabase 조회 실패 ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function listImageFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listImageFiles(fullPath, relative));
    } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      const info = await stat(fullPath);
      files.push({ name: relative, bytes: info.size });
    }
  }
  return files.sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

async function readSavedMappings() {
  if (!existsSync(STATE_PATH)) return {};
  const saved = JSON.parse(await readFile(STATE_PATH, "utf8"));
  return saved.mappings ?? {};
}

async function loadRemoteCatalog() {
  const { supabaseUrl, adminKey } = loadAdminContext();
  const [items, images] = await Promise.all([
    fetchJson(
      `${supabaseUrl}/rest/v1/closet_items` +
        `?workspace_id=eq.${WORKSPACE_ID}` +
        "&select=id,name,category&order=name&limit=1000",
      adminKey,
    ),
    fetchJson(
      `${supabaseUrl}/rest/v1/closet_item_images` +
        `?workspace_id=eq.${WORKSPACE_ID}` +
        "&variant=eq.cutout&status=eq.ready&select=item_id&limit=1000",
      adminKey,
    ),
  ]);
  const readyIds = new Set(images.map((row) => row.item_id));
  return {
    items: items.map((item) => ({
      ...item,
      hasReadyImage: readyIds.has(item.id),
    })),
    supabaseUrl,
    adminKey,
  };
}

async function buildState() {
  await Promise.all([
    mkdir(INBOX, { recursive: true }),
    mkdir(PREPARED, { recursive: true }),
  ]);
  const [{ items }, files, savedMappings] = await Promise.all([
    loadRemoteCatalog(),
    listImageFiles(INBOX),
    readSavedMappings(),
  ]);
  const fileRows = files.map((file) => ({
    ...file,
    ...suggestItemMatches(file.name, items),
  }));
  const mappings = {};
  for (const file of fileRows) {
    const saved = savedMappings[file.name];
    if (saved && items.some((item) => item.id === saved)) {
      mappings[file.name] = saved;
    } else if (file.autoItemId) {
      mappings[file.name] = file.autoItemId;
    }
  }
  return {
    inboxPath: INBOX,
    files: fileRows,
    items,
    mappings,
  };
}

async function parseBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) throw new Error("요청이 너무 큽니다.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(value));
}

async function saveMappings(mappings) {
  const state = await buildState();
  const checked = validateMappings(state.files, state.items, mappings);
  if (checked.errors.length > 0) throw new Error(checked.errors.join("\n"));
  await writeFile(
    STATE_PATH,
    `${JSON.stringify({ version: 1, mappings: checked.valid }, null, 2)}\n`,
  );
  return checked.valid;
}

async function processOne({ filename, itemId, mode, allowReplace }) {
  invariant(mode === "dry-run" || mode === "apply", "처리 모드가 잘못되었습니다.");
  const state = await buildState();
  const checked = validateMappings(
    state.files,
    state.items,
    { [filename]: itemId },
  );
  invariant(checked.errors.length === 0, checked.errors.join("\n"));
  invariant(checked.valid[filename] === itemId, "파일과 Item 매칭이 필요합니다.");
  const item = state.items.find((candidate) => candidate.id === itemId);
  invariant(item, "대상 Item을 찾을 수 없습니다.");
  if (mode === "apply" && item.hasReadyImage && !allowReplace) {
    throw new Error(`${item.name}에는 이미 이미지가 있습니다. 교체 허용을 확인해 주세요.`);
  }

  const prepared = await prepareItem({
    item: {
      uuid: item.id,
      name: item.name,
      category: item.category,
      filename,
    },
    inputDirectory: INBOX,
    preparedDirectory: PREPARED,
    workspaceId: WORKSPACE_ID,
    alphaThreshold: 10,
  });

  if (mode === "apply") {
    const { supabaseUrl, adminKey } = loadAdminContext();
    const manifest = {
      items: [{
        uuid: item.id,
        name: item.name,
        category: item.category,
      }],
    };
    await verifyRemoteItems({
      supabaseUrl,
      adminKey,
      workspaceId: WORKSPACE_ID,
      manifest,
    });
    const client = createClient(supabaseUrl, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await applyPreparedItem({ client, prepared });
  }

  const asset = prepared.assets[0];
  return {
    mode,
    filename,
    itemId,
    itemName: item.name,
    bytes: asset.bytes,
    width: asset.width,
    height: asset.height,
    warnings: prepared.warnings,
  };
}

async function removeObjectsQuietly(client, paths) {
  if (!paths?.length) return;
  try {
    await client.storage.from(BUCKET).remove(paths);
  } catch {
    // A later upload attempt or orphan audit can retry cleanup.
  }
}

export async function applyPreparedItem({ client, prepared }) {
  const asset = prepared.assets[0];
  const imageId = randomUUID();
  const begin = await client.rpc("begin_closet_item_image_upload", {
    p_workspace_id: WORKSPACE_ID,
    p_item_id: prepared.itemId,
    p_image_id: imageId,
    p_width_px: asset.width,
    p_height_px: asset.height,
    p_bytes: asset.bytes,
  });
  if (begin.error) throw begin.error;
  const pending = (Array.isArray(begin.data) ? begin.data[0] : begin.data);
  invariant(pending?.storage_path, "pending 이미지 경로를 받지 못했습니다.");
  await removeObjectsQuietly(client, pending.abandoned_storage_paths ?? []);

  try {
    const upload = await client.storage
      .from(BUCKET)
      .upload(pending.storage_path, await readFile(asset.localPath), {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });
    if (upload.error) throw upload.error;

    const finalize = await client.rpc("finalize_closet_item_image_upload", {
      p_workspace_id: WORKSPACE_ID,
      p_item_id: prepared.itemId,
      p_image_id: imageId,
    });
    if (finalize.error) throw finalize.error;
    const ready = Array.isArray(finalize.data)
      ? finalize.data[0]
      : finalize.data;
    invariant(ready?.storage_path, "ready 이미지 결과를 받지 못했습니다.");
    await removeObjectsQuietly(client, ready.replaced_storage_paths ?? []);
    return ready;
  } catch (error) {
    const cancel = await client.rpc("cancel_closet_item_image_upload", {
      p_workspace_id: WORKSPACE_ID,
      p_item_id: prepared.itemId,
      p_image_id: imageId,
    });
    const cancelledPath =
      typeof cancel.data === "string" ? cancel.data : pending.storage_path;
    await removeObjectsQuietly(client, cancelledPath ? [cancelledPath] : []);
    throw error;
  }
}

function safeInboxPath(filename) {
  const resolved = path.resolve(INBOX, filename);
  invariant(
    resolved.startsWith(`${INBOX}${path.sep}`),
    "허용되지 않은 파일 경로입니다.",
  );
  return resolved;
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${HOST}:${PORT}`);
  try {
    if (request.method === "GET" && url.pathname === "/") {
      const html = await readFile(UI_PATH);
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(html);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/state") {
      sendJson(response, 200, await buildState());
      return;
    }
    if (request.method === "GET" && url.pathname === "/preview") {
      const filename = invariant(url.searchParams.get("file"), "파일명이 필요합니다.");
      const filePath = safeInboxPath(filename);
      const extension = path.extname(filePath).toLowerCase();
      const types = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".heic": "image/heic",
        ".heif": "image/heif",
      };
      response.writeHead(200, {
        "Content-Type": types[extension] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(await readFile(filePath));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/save") {
      const body = await parseBody(request);
      sendJson(response, 200, { mappings: await saveMappings(body.mappings) });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/open-inbox") {
      if (process.platform === "win32") {
        const child = spawn("explorer.exe", [INBOX], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
      }
      sendJson(response, 200, { inboxPath: INBOX });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/process") {
      const body = await parseBody(request);
      if (body.mode === "apply") {
        invariant(body.confirm === "UPLOAD", "업로드 확인이 필요합니다.");
      }
      sendJson(response, 200, await processOne(body));
      return;
    }
    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function start() {
  await Promise.all([
    mkdir(INBOX, { recursive: true }),
    mkdir(PREPARED, { recursive: true }),
  ]);
  const server = createServer((request, response) => {
    void handle(request, response);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, resolve);
  });
  const url = `http://${HOST}:${PORT}`;
  console.log(`\nCloset Index 대량 이미지 도구: ${url}`);
  console.log(`누끼 폴더: ${INBOX}`);
  console.log("종료: Ctrl+C\n");
  if (process.platform === "win32" && !process.argv.includes("--no-open")) {
    const child = spawn("cmd.exe", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  }
  return server;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  await start();
}
