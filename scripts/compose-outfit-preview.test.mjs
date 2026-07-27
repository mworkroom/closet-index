import { describe, expect, it } from "vitest";
import {
  applyDefaultRelationships,
  analyzeCompositionManifest,
  resolveCategoryDefaults,
} from "./compose-outfit-preview.mjs";

const config = {
  slots: {
    "main-upper": { allowRoleCollisions: true },
    "main-innerwear": {},
    "main-bottom": {},
    "main-dress": {},
    "side-top": {},
  },
  compositionRoles: {
    "outer-front": {
      slot: "main-upper",
      zIndex: 60,
    },
    "outer-back": {
      slot: "main-upper",
      zIndex: 50,
    },
  },
  categoryRules: [
    {
      match: "prefix",
      value: "Outer",
      slot: "main-upper",
      zIndex: 60,
      visualScale: 1,
      visualHeight: 500,
    },
    {
      match: "exact",
      value: "Top-T-shirts-innerwear",
      slot: "main-innerwear",
      zIndex: 40,
      visualScale: 0.4,
    },
    {
      match: "prefix",
      value: "Top-T-shirts",
      slotWhenOuter: "side-top",
      slotWithoutOuter: "main-upper",
      zIndexWhenOuter: 0,
      zIndexWithoutOuter: 50,
      visualScaleWhenOuter: 0.45,
      visualScaleWithoutOuter: 0.85,
      visualHeightWithoutOuter: 440,
    },
    {
      match: "prefix",
      value: "Bottom",
      slot: "main-bottom",
      zIndex: 30,
      visualScale: 0.64,
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
    ).toEqual({
      slot: "main-innerwear",
      zIndex: 40,
      visualScale: 0.4,
    });
  });

  it("places Top-T-shirts at the bottom of the side column only with an outer", () => {
    expect(
      resolveCategoryDefaults("Top-T-shirts", true, config.categoryRules),
    ).toEqual({ slot: "side-top", zIndex: 0, visualScale: 0.45 });
    expect(
      resolveCategoryDefaults("Top-T-shirts", false, config.categoryRules),
    ).toEqual({
      slot: "main-upper",
      zIndex: 50,
      visualScale: 0.85,
      visualHeight: 440,
    });
  });

  it("keeps innerwear above bottoms and lets a back outer share the upper slot", () => {
    const result = analyzeCompositionManifest(
      {
        items: [
          {
            name: "앞 아우터",
            category: "Outer-Vest",
            compositionRole: "outer-front",
          },
          {
            name: "뒤 아우터",
            category: "Outer-Knit",
            compositionRole: "outer-back",
          },
          {
            name: "이너웨어",
            category: "Top-T-shirts-innerwear",
          },
          {
            name: "하의",
            category: "Bottom-Skirts",
          },
        ],
      },
      config,
    );
    expect(result.blockers).toEqual([]);
    expect(result.items.map(({ name, zIndex }) => [name, zIndex])).toEqual([
      ["앞 아우터", 60],
      ["뒤 아우터", 50],
      ["이너웨어", 40],
      ["하의", 30],
    ]);
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

  it("creates a default hem-to-shoes gap before saved position offsets", () => {
    const items = [
      {
        top: 500,
        positionY: -8,
        report: {
          category: "Bottom-Skirts",
          rendered: { height: 486, top: 500 },
        },
      },
      {
        top: 922,
        positionY: 0,
        report: {
          category: "Shoes",
          rendered: { height: 213, top: 922 },
        },
      },
    ];

    applyDefaultRelationships(items, { hemToShoesGap: 32 });

    expect(items[0].top).toBe(396);
    expect(items[1].top - (items[0].top + 486)).toBe(40);
  });
});
