import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { encodeWebpToTarget } from "./encode-webp-to-target.mjs";

function deterministicNoise(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  let state = 0x12345678;
  for (let index = 0; index < pixels.length; index += 4) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    pixels[index] = state & 0xff;
    pixels[index + 1] = (state >>> 8) & 0xff;
    pixels[index + 2] = (state >>> 16) & 0xff;
    pixels[index + 3] = 255;
  }
  return sharp(pixels, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

describe("target-sized WebP encoding", () => {
  it("tries a smaller candidate when the first encoding is too large", async () => {
    const input = await deterministicNoise(500, 500);
    const result = await encodeWebpToTarget(input, {
      targetMaxBytes: 70 * 1024,
      candidates: [
        { maxDimension: 500, quality: 90 },
        { maxDimension: 360, quality: 45 },
      ],
      alphaQuality: 90,
      effort: 2,
    });

    expect(result.targetMet).toBe(true);
    expect(result.data.byteLength).toBeLessThanOrEqual(70 * 1024);
    expect(result.encoding.attempts).toHaveLength(2);
    expect(result.encoding.maxDimension).toBe(360);
    expect(result.encoding.quality).toBe(45);
  });
});
