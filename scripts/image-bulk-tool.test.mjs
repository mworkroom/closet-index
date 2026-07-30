import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { applyPreparedItem } from "./image-bulk-tool.mjs";

function prepared(localPath) {
  return {
    itemId: "349f66af-29b2-80a2-86bc-f36a66c42ccf",
    assets: [{
      localPath,
      width: 900,
      height: 1200,
      bytes: 4,
    }],
  };
}

describe("bulk image upload lifecycle", () => {
  it("begins, uploads, finalizes, and cleans replaced objects", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bulk-upload-test-"));
    const localPath = path.join(root, "cutout.webp");
    await writeFile(localPath, Buffer.from("webp"));
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{
          storage_path: "workspace/items/item/cutout/new.webp",
          abandoned_storage_paths: ["old-pending.webp"],
        }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          storage_path: "workspace/items/item/cutout/new.webp",
          replaced_storage_paths: ["old-ready.webp"],
        }],
        error: null,
      });
    const upload = vi.fn(async () => ({ error: null }));
    const remove = vi.fn(async () => ({ error: null }));
    const client = {
      rpc,
      storage: {
        from: vi.fn(() => ({ upload, remove })),
      },
    };

    try {
      await applyPreparedItem({ client, prepared: prepared(localPath) });
      expect(rpc.mock.calls.map(([name]) => name)).toEqual([
        "begin_closet_item_image_upload",
        "finalize_closet_item_image_upload",
      ]);
      expect(upload).toHaveBeenCalledWith(
        "workspace/items/item/cutout/new.webp",
        Buffer.from("webp"),
        expect.objectContaining({ upsert: false }),
      );
      expect(remove).toHaveBeenCalledWith(["old-pending.webp"]);
      expect(remove).toHaveBeenCalledWith(["old-ready.webp"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
