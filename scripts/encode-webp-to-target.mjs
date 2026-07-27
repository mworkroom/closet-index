import sharp from "sharp";

function invariant(value, message) {
  if (!value) throw new Error(message);
  return value;
}

export async function encodeWebpToTarget(
  input,
  {
    targetMaxBytes,
    candidates,
    alphaQuality = 90,
    effort = 6,
  },
) {
  invariant(
    Number.isInteger(targetMaxBytes) && targetMaxBytes > 0,
    "targetMaxBytes는 양의 정수여야 합니다.",
  );
  invariant(
    Array.isArray(candidates) && candidates.length > 0,
    "WebP 인코딩 후보가 필요합니다.",
  );

  const attempts = [];
  let selected = null;
  for (const candidate of candidates) {
    invariant(
      Number.isInteger(candidate.quality) &&
        candidate.quality >= 1 &&
        candidate.quality <= 100,
      `잘못된 WebP quality입니다: ${candidate.quality}`,
    );
    let pipeline = sharp(input);
    if (candidate.maxDimension) {
      pipeline = pipeline.resize({
        width: candidate.maxDimension,
        height: candidate.maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const encoded = await pipeline
      .webp({
        quality: candidate.quality,
        alphaQuality,
        effort,
      })
      .toBuffer({ resolveWithObject: true });
    const attempt = {
      quality: candidate.quality,
      maxDimension: candidate.maxDimension ?? null,
      width: encoded.info.width,
      height: encoded.info.height,
      bytes: encoded.data.byteLength,
    };
    attempts.push(attempt);
    selected = { ...encoded, attempt };
    if (encoded.data.byteLength <= targetMaxBytes) break;
  }

  invariant(selected, "WebP 인코딩 결과가 없습니다.");
  return {
    data: selected.data,
    info: selected.info,
    targetMet: selected.data.byteLength <= targetMaxBytes,
    encoding: {
      targetMaxBytes,
      ...selected.attempt,
      attempts,
    },
  };
}
