import { describe, expect, it } from "vitest";
import {
  analyzeCompositionManifest,
  resolveCategoryDefaults,
} from "./compose-outfit-preview.mjs";

const config = {
  slots: {
    "main-outer": {},
    "main-innerwear": {},
    "main-bottom": {},
    "side-top": {},
  },
  categoryRules: [
    {
      match: "prefix",
      value: "Outer",
      slot: "main-outer",
      zIndex: 50,
    },
    {
      match: "exact",
      value: "Top-T-shirts-innerwear",
      slot: "main-innerwear",
      zIndex: 40,
    },
    {
      match: "prefix",
      value: "Top",
      slotWhenOuter: "side-top",
      slotWithoutOuter: "main-outer",
      zIndex: 40,
    },
    {
      match: "prefix",
      value: "Bottom",
      slot: "main-bottom",
      zIndex: 30,
    },
  ],
};

describe("Outfit composition contract", () => {
  it("maps innerwear before the general Top prefix", () => {
    expect(
      resolveCategoryDefaults(
        "Top-T-shirts-innerwear",
        true,
        config.categoryRules,
      ),
    ).toEqual({ slot: "main-innerwear", zIndex: 40 });
  });

  it("places a general top beside an outer and in the main column otherwise", () => {
    expect(
      resolveCategoryDefaults("Top-T-shirts", true, config.categoryRules),
    ).toEqual({ slot: "side-top", zIndex: 40 });
    expect(
      resolveCategoryDefaults("Top-T-shirts", false, config.categoryRules),
    ).toEqual({ slot: "main-outer", zIndex: 40 });
  });

  it("reports unknown categories and same-slot collisions", () => {
    const result = analyzeCompositionManifest(
      {
        items: [
          { name: "A", category: "Bottom-Skirts" },
          { name: "B", category: "Bottom-Pants" },
          { name: "C", category: "Unknown" },
        ],
      },
      config,
    );
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining("알 수 없는 category"),
        expect.stringContaining("slot 충돌"),
      ]),
    );
  });
});
