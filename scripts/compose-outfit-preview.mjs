import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIG_PATH = path.join(
  SCRIPT_DIRECTORY,
  "outfit-composition.v1.json",
);

function invariant(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function resolveCategoryDefaults(category, hasOuter, rules) {
  const rule = rules.find((candidate) => {
    if (candidate.match === "exact") return category === candidate.value;
    if (candidate.match === "prefix") {
      return category.startsWith(candidate.value);
    }
    return false;
  });
  if (!rule) return null;
  return {
    slot:
      rule.slot ??
      (hasOuter ? rule.slotWhenOuter : rule.slotWithoutOuter),
    zIndex: rule.zIndex,
  };
}

export function analyzeCompositionManifest(manifest, config) {
  const blockers = [];
  const warnings = [];
  const hasOuter = manifest.items.some((item) =>
    item.category?.startsWith("Outer"),
  );
  const resolvedItems = manifest.items.map((item) => {
    const defaults = resolveCategoryDefaults(
      item.category ?? "",
      hasOuter,
      config.categoryRules,
    );
    if (!defaults) {
      blockers.push(`${item.name}: 알 수 없는 category ${item.category}`);
    }
    const slot = item.slot ?? defaults?.slot;
    if (!slot || !config.slots[slot]) {
      blockers.push(`${item.name}: 알 수 없는 slot ${slot ?? "없음"}`);
    }
    if (
      defaults &&
      item.slot &&
      item.slot !== defaults.slot &&
      !item.allowSlotOverride
    ) {
      blockers.push(
        `${item.name}: category 기본 slot ${defaults.slot}과 ` +
          `manifest slot ${item.slot}이 다름`,
      );
    }
    return {
      ...item,
      slot,
      zIndex: item.zIndex ?? defaults?.zIndex ?? 0,
    };
  });

  const itemsBySlot = new Map();
  for (const item of resolvedItems) {
    if (!item.slot) continue;
    const slotItems = itemsBySlot.get(item.slot) ?? [];
    slotItems.push(item);
    itemsBySlot.set(item.slot, slotItems);
  }
  for (const [slot, items] of itemsBySlot) {
    if (
      items.length > 1 &&
      !items.every((item) => item.allowSlotCollision)
    ) {
      blockers.push(
        `${slot}: ${items.map((item) => item.name).join(", ")} slot 충돌`,
      );
    }
  }

  return { blockers, warnings, items: resolvedItems };
}

function getPlacement(slot, width, height, item) {
  const x =
    slot.x +
    Math.round((slot.width - width) / 2) +
    Math.round(item.positionX ?? 0);
  let y;
  if (slot.anchor === "bottom") {
    y = slot.y + slot.height - height;
  } else if (slot.anchor === "center") {
    y = slot.y + Math.round((slot.height - height) / 2);
  } else {
    y = slot.y;
  }
  return {
    left: x,
    top: y + Math.round(item.positionY ?? 0),
  };
}

async function normalizeItem({
  item,
  inputDirectory,
  slots,
  alphaThreshold,
}) {
  const inputPath = path.resolve(inputDirectory, item.filename);
  const sourceBuffer = await readFile(inputPath);
  const metadata = await sharp(sourceBuffer).metadata();
  invariant(
    Number.isInteger(metadata.width) && Number.isInteger(metadata.height),
    `${item.name}: 이미지 크기를 읽을 수 없습니다.`,
  );
  invariant(metadata.hasAlpha, `${item.name}: alpha 채널이 없습니다.`);

  const trimmed = await sharp(sourceBuffer)
    .ensureAlpha()
    .trim({
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      threshold: alphaThreshold,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const safetyMarginRatio = item.safetyMarginRatio ?? 0.025;
  const safetyMargin = Math.max(
    2,
    Math.round(
      Math.max(trimmed.info.width, trimmed.info.height) * safetyMarginRatio,
    ),
  );
  const padded = await sharp(trimmed.data)
    .extend({
      top: safetyMargin,
      bottom: safetyMargin,
      left: safetyMargin,
      right: safetyMargin,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const slot = {
    ...slots[item.slot],
    ...item.slotOverride,
  };
  const scale = item.scale ?? 1;
  const resized = await sharp(padded.data)
    .resize({
      width: Math.max(1, Math.round(slot.width * scale)),
      height: Math.max(1, Math.round(slot.height * scale)),
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const placement = getPlacement(
    slot,
    resized.info.width,
    resized.info.height,
    item,
  );
  return {
    input: resized.data,
    left: placement.left,
    top: placement.top,
    zIndex: item.zIndex,
    sourceSha256: sha256(sourceBuffer),
    report: {
      uuid: item.uuid,
      name: item.name,
      category: item.category,
      slot: item.slot,
      sourceSha256: sha256(sourceBuffer),
      source: {
        width: metadata.width,
        height: metadata.height,
        hasAlpha: metadata.hasAlpha,
      },
      trimmed: {
        width: trimmed.info.width,
        height: trimmed.info.height,
      },
      padded: {
        width: padded.info.width,
        height: padded.info.height,
      },
      rendered: {
        width: resized.info.width,
        height: resized.info.height,
        left: placement.left,
        top: placement.top,
        zIndex: item.zIndex,
      },
    },
  };
}

export async function composeOutfitPreview({
  manifestPath,
  outputDirectory: outputDirectoryArgument,
  configPath = DEFAULT_CONFIG_PATH,
}) {
  const resolvedManifestPath = path.resolve(manifestPath);
  const manifestDirectory = path.dirname(resolvedManifestPath);
  const [manifest, config] = await Promise.all([
    readFile(resolvedManifestPath, "utf8").then(JSON.parse),
    readFile(path.resolve(configPath), "utf8").then(JSON.parse),
  ]);
  invariant(
    Number.isInteger(config.version) && config.version > 0,
    "composition config version이 필요합니다.",
  );
  const analysis = analyzeCompositionManifest(manifest, config);
  invariant(
    analysis.blockers.length === 0,
    `합성 차단 항목: ${analysis.blockers.join("; ")}`,
  );

  const canvas = {
    width: manifest.canvas?.width ?? config.canvas.width,
    height: manifest.canvas?.height ?? config.canvas.height,
  };
  invariant(
    canvas.width === config.canvas.width &&
      canvas.height === config.canvas.height,
    `composition v${config.version} canvas는 ` +
      `${config.canvas.width}x${config.canvas.height}여야 합니다.`,
  );
  const inputDirectory = path.resolve(
    manifestDirectory,
    manifest.inputDirectory ?? "input",
  );
  const outputDirectory = path.resolve(
    outputDirectoryArgument ??
      path.join(manifestDirectory, manifest.outputDirectory ?? "output"),
  );
  const outputStem = manifest.outputStem ?? "outfit-preview";
  const alphaThreshold = manifest.alphaThreshold ?? 10;
  await mkdir(outputDirectory, { recursive: true });

  const normalizedItems = await Promise.all(
    analysis.items.map((item) =>
      normalizeItem({
        item,
        inputDirectory,
        slots: {
          ...config.slots,
          ...manifest.slots,
        },
        alphaThreshold,
      }),
    ),
  );
  normalizedItems.sort(
    (left, right) =>
      left.zIndex - right.zIndex ||
      left.report.uuid.localeCompare(right.report.uuid),
  );
  for (const item of normalizedItems) {
    const right = item.left + item.report.rendered.width;
    const bottom = item.top + item.report.rendered.height;
    invariant(
      item.left >= 0 &&
        item.top >= 0 &&
        right <= canvas.width &&
        bottom <= canvas.height,
      `${item.report.name}이 ${canvas.width}x${canvas.height} canvas를 벗어남`,
    );
  }

  const transparentBuffer = await sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite(
      normalizedItems.map(({ input, left, top }) => ({
        input,
        left,
        top,
      })),
    )
    .png()
    .toBuffer();
  const preview = await sharp(transparentBuffer)
    .webp({
      quality: config.preview.quality,
      alphaQuality: config.preview.alphaQuality,
      effort: config.preview.effort,
    })
    .toBuffer({ resolveWithObject: true });

  const transparentOutput = path.join(
    outputDirectory,
    `${outputStem}-transparent.png`,
  );
  const reviewOutput = path.join(
    outputDirectory,
    `${outputStem}-review.png`,
  );
  const previewOutput = path.join(
    outputDirectory,
    `${outputStem}-preview-v${config.version}.webp`,
  );
  const reportOutput = path.join(
    outputDirectory,
    `${outputStem}-report.json`,
  );
  const warnings = [...analysis.warnings];
  if (preview.data.byteLength > config.preview.targetMaxBytes) {
    warnings.push(
      `preview가 초기 ${Math.round(
        config.preview.targetMaxBytes / 1024,
      )}KB 목표를 초과함: ${Math.round(preview.data.byteLength / 1024)}KB`,
    );
  }
  const inputFingerprint = sha256(
    stableJson({
      compositionVersion: config.version,
      canvas,
      alphaThreshold,
      slots: config.slots,
      items: normalizedItems.map((item) => ({
        uuid: item.report.uuid,
        category: item.report.category,
        slot: item.report.slot,
        zIndex: item.report.rendered.zIndex,
        scale:
          analysis.items.find((source) => source.uuid === item.report.uuid)
            ?.scale ?? 1,
        positionX:
          analysis.items.find((source) => source.uuid === item.report.uuid)
            ?.positionX ?? 0,
        positionY:
          analysis.items.find((source) => source.uuid === item.report.uuid)
            ?.positionY ?? 0,
        sourceSha256: item.sourceSha256,
      })),
    }),
  );
  const report = {
    status: "ready",
    compositionVersion: config.version,
    configFile: path.basename(configPath),
    outfit: manifest.outfit,
    canvas,
    alphaThreshold,
    inputFingerprint,
    preview: {
      filename: path.basename(previewOutput),
      width: preview.info.width,
      height: preview.info.height,
      bytes: preview.data.byteLength,
      sha256: sha256(preview.data),
    },
    validation: {
      blockers: [],
      warnings,
      slotCollisions: [],
    },
    items: normalizedItems.map(({ report: itemReport }) => itemReport),
  };

  await Promise.all([
    writeFile(transparentOutput, transparentBuffer),
    sharp(transparentBuffer)
      .flatten({ background: manifest.reviewBackground ?? "#eceae5" })
      .png()
      .toFile(reviewOutput),
    writeFile(previewOutput, preview.data),
    writeFile(reportOutput, `${JSON.stringify(report, null, 2)}\n`),
  ]);

  return {
    manifest,
    config,
    report,
    paths: {
      transparentOutput,
      reviewOutput,
      previewOutput,
      reportOutput,
    },
  };
}

export async function run(argv = process.argv) {
  const manifestArgument = argv[2];
  if (!manifestArgument) {
    throw new Error(
      "Usage: npm run outfit:preview -- <manifest.json> [output-directory]",
    );
  }
  const result = await composeOutfitPreview({
    manifestPath: manifestArgument,
    outputDirectory: argv[3],
  });
  console.log(
    JSON.stringify(
      {
        compositionVersion: result.report.compositionVersion,
        preview: result.report.preview,
        warnings: result.report.validation.warnings,
        ...result.paths,
      },
      null,
      2,
    ),
  );
  return result;
}

const isMain =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  await run();
}
