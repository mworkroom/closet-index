import { describe, expect, it } from "vitest";
import {
  createPreviewAssetPlan,
  decidePreviewAction,
} from "./upload-outfit-preview.mjs";

const workspaceId = "00000000-0000-0000-0000-000000000003";
const outfitId = "350f66af-29b2-8049-a80f-ecc94ff0d9a4";

describe("Outfit preview upload contract", () => {
  it("creates a stable versioned preview path", () => {
    const first = createPreviewAssetPlan({
      workspaceId,
      outfitId,
      compositionVersion: 1,
    });
    const second = createPreviewAssetPlan({
      workspaceId,
      outfitId,
      compositionVersion: 1,
    });
    expect(first).toEqual(second);
    expect(first.storagePath).toBe(
      `${workspaceId}/outfits/${outfitId}/preview/v1.webp`,
    );
  });

  it("leaves an identical ready preview unchanged", () => {
    expect(
      decidePreviewAction({
        existingMetadata: { status: "ready" },
        existingObjectSha256: "same",
        expectedSha256: "same",
      }),
    ).toBe("unchanged");
  });

  it("blocks overwriting a different ready preview at the same version", () => {
    expect(() =>
      decidePreviewAction({
        existingMetadata: { status: "ready" },
        existingObjectSha256: "old",
        expectedSha256: "new",
      }),
    ).toThrow("version을 올리세요");
  });
});
