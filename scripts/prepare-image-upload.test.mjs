import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAssetPlan,
  resolveManifestInput,
  stableUuid,
} from "./prepare-image-upload.mjs";

const workspaceId = "00000000-0000-0000-0000-000000000003";
const itemId = "349f66af-29b2-80a2-86bc-f36a66c42ccf";

describe("Phase 1B image upload plan", () => {
  it("creates deterministic UUIDs", () => {
    expect(stableUuid("same-input")).toBe(stableUuid("same-input"));
    expect(stableUuid("same-input")).not.toBe(stableUuid("other-input"));
  });

  it("creates stable workspace and item scoped paths", () => {
    const first = createAssetPlan({ workspaceId, itemId });
    const second = createAssetPlan({ workspaceId, itemId });

    expect(first).toEqual(second);
    expect(first.original.storagePath).toBe(
      `${workspaceId}/items/${itemId}/original/${first.original.id}.png`,
    );
    expect(first.cutout.storagePath).toBe(
      `${workspaceId}/items/${itemId}/cutout/${first.cutout.id}.webp`,
    );
  });

  it("rejects manifest input paths outside the local-only input folder", () => {
    const root = path.resolve("assets/private/phase-1b/input");
    expect(() => resolveManifestInput(root, "../secret.png")).toThrow(
      "inputDirectory 밖",
    );
  });
});
