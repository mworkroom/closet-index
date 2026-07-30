import path from "node:path";

export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".heic",
  ".heif",
]);

export function normalizeImageName(value) {
  return path
    .basename(value, path.extname(value))
    .normalize("NFKC")
    .toLocaleLowerCase("ko")
    .replace(/\s*\(\d+\)\s*$/u, "")
    .replace(/\s*[-_]\s*(copy|복사본|\d+)\s*$/iu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function bigrams(value) {
  if (value.length < 2) return new Set([value]);
  return new Set(Array.from({ length: value.length - 1 }, (_, index) =>
    value.slice(index, index + 2),
  ));
}

export function similarity(left, right) {
  const a = bigrams(normalizeImageName(left));
  const b = bigrams(normalizeImageName(right));
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }
  return (2 * overlap) / (a.size + b.size);
}

export function suggestItemMatches(filename, items, limit = 5) {
  const normalized = normalizeImageName(filename);
  const exact = items.filter(
    (item) => normalizeImageName(item.name) === normalized,
  );
  const autoItemId = exact.length === 1 ? exact[0].id : null;
  const suggestions = [...items]
    .map((item) => ({
      itemId: item.id,
      score:
        normalizeImageName(item.name) === normalized
          ? 1
          : similarity(filename, item.name),
    }))
    .sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId))
    .slice(0, limit);

  return { autoItemId, suggestions };
}

export function validateMappings(files, items, mappings) {
  const fileNames = new Set(files.map((file) => file.name));
  const itemIds = new Set(items.map((item) => item.id));
  const selectedItems = new Set();
  const valid = {};
  const errors = [];

  for (const [filename, itemId] of Object.entries(mappings ?? {})) {
    if (!itemId) continue;
    if (!fileNames.has(filename)) {
      errors.push(`폴더에 없는 파일입니다: ${filename}`);
      continue;
    }
    if (!itemIds.has(itemId)) {
      errors.push(`존재하지 않는 Item입니다: ${itemId}`);
      continue;
    }
    if (selectedItems.has(itemId)) {
      errors.push(`한 Item에 여러 파일이 선택되었습니다: ${itemId}`);
      continue;
    }
    selectedItems.add(itemId);
    valid[filename] = itemId;
  }

  return { valid, errors };
}
