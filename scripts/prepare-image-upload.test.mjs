import path from "node:path";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  createAssetPlan,
  manifestOutfitIds,
  prepareItem,
  resolveManifestInput,
  stableUuid,
  validateManifest,
} from "./prepare-image-upload.mjs";

const workspaceId = "00000000-0000-0000-0000-000000000003";
const itemId = "349f66af-29b2-80a2-86bc-f36a66c42ccf";

describe("Phase 1B image upload plan", () => {
  it("creates deterministic UUIDs", () => {
    expect(stableUuid("same-input")).toBe(stableUuid("same-input"));
    expect(stableUuid("same-input")).not.toBe(stableUuid("other-input"));
  });

  it("creates only a stable workspace-scoped cutout path", () => {
    const first = createAssetPlan({ workspaceId, itemId });
    const second = createAssetPlan({ workspaceId, itemId });

    expect(first).toEqual(second);
    expect(first).not.toHaveProperty("original");
    expect(first.cutout.storagePath).toBe(
      `${workspaceId}/items/${itemId}/cutout/${first.cutout.id}.webp`,
    );
  });

  it("accepts a multi-outfit batch and de-duplicates relation checks", () => {
    const outfitIds = [
      "34df66af-29b2-80c1-80ac-ce231cfecfdb",
      "34df66af-29b2-8033-9f72-dfe13ce6377c",
    ];
    const manifest = {
      version: 1,
      outfit: { uuid: outfitIds[0] },
      outfits: outfitIds.map((uuid) => ({ uuid })),
      items: [
        {
          uuid: itemId,
          name: "Test Item",
          category: "Top-T-shirts",
          filename: "source.png",
        },
      ],
    };

    expect(manifestOutfitIds(manifest)).toEqual(outfitIds);
    expect(() => validateManifest(manifest, workspaceId)).not.toThrow();
  });

  it("keeps the source local and prepares one target-sized WebP asset", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "closet-image-test-"));
    const inputDirectory = path.join(root, "input");
    const preparedDirectory = path.join(root, "prepared");
    await Promise.all([
      mkdir(inputDirectory, { recursive: true }),
      mkdir(preparedDirectory, { recursive: true }),
    ]);
    const filename = "source.png";
    const inputPath = path.join(inputDirectory, filename);
    await sharp({
      create: {
        width: 900,
        height: 900,
        channels: 4,
        background: { r: 30, g: 60, b: 90, alpha: 0 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="820" height="820"><rect x="10" y="10" width="800" height="800" rx="80" fill="#46607a"/><path d="M80 740L410 80L740 740Z" fill="#d4b88c"/></svg>',
          ),
          left: 40,
          top: 40,
        },
      ])
      .png()
      .toFile(inputPath);

    try {
      const result = await prepareItem({
        item: {
          uuid: itemId,
          name: "테스트 아이템",
          category: "Top-T-shirts",
          filename,
        },
        inputDirectory,
        preparedDirectory,
        workspaceId,
        alphaThreshold: 10,
      });
      expect(result.assets).toHaveLength(1);
      expect(result.assets[0]).toMatchObject({
        variant: "cutout",
        contentType: "image/webp",
      });
      expect(result.assets[0].bytes).toBeLessThanOrEqual(500 * 1024);
      expect(result.assets[0].encoding.targetMaxBytes).toBe(500 * 1024);
      await expect(
        access(path.join(preparedDirectory, `${itemId}__original.png`)),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects manifest input paths outside the local-only input folder", () => {
    const root = path.resolve("assets/private/phase-1b/input");
    expect(() => resolveManifestInput(root, "../secret.png")).toThrow(
      "inputDirectory 밖",
    );
  });
});
