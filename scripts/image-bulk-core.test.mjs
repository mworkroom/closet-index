import { describe, expect, it } from "vitest";
import {
  normalizeImageName,
  similarity,
  suggestItemMatches,
  validateMappings,
} from "./image-bulk-core.mjs";

const items = [
  { id: "bag", name: "블랙 숄더백" },
  { id: "knit", name: "아이보리 니트" },
  { id: "shoe", name: "나이키 운동화" },
];

describe("bulk image matching", () => {
  it("normalizes common duplicate filename suffixes", () => {
    expect(normalizeImageName("블랙 숄더백 (2).PNG")).toBe("블랙숄더백");
    expect(normalizeImageName("아이보리_니트-copy.webp")).toBe("아이보리니트");
  });

  it("auto-matches only one exact normalized Item name", () => {
    expect(suggestItemMatches("블랙-숄더백.png", items).autoItemId).toBe("bag");
    expect(
      suggestItemMatches("블랙 숄더백.png", [
        ...items,
        { id: "bag-2", name: "블랙숄더백" },
      ]).autoItemId,
    ).toBeNull();
  });

  it("ranks similar Item names for manual review", () => {
    const result = suggestItemMatches("나이키 운동화 검정.png", items);
    expect(result.suggestions[0].itemId).toBe("shoe");
    expect(similarity("나이키 운동화 검정", "나이키 운동화")).toBeGreaterThan(0.5);
  });

  it("rejects duplicate Item mappings", () => {
    const result = validateMappings(
      [{ name: "a.png" }, { name: "b.png" }],
      items,
      { "a.png": "bag", "b.png": "bag" },
    );
    expect(result.errors).toHaveLength(1);
    expect(result.valid).toEqual({ "a.png": "bag" });
  });
});
