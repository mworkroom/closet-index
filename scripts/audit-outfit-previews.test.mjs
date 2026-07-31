import { describe, expect, it } from 'vitest'
import { classifyPreviewAudit } from './audit-outfit-previews.mjs'

describe('Outfit preview orphan audit', () => {
  it('separates stale metadata, missing ready objects, and orphan objects', () => {
    const report = classifyPreviewAudit({
      previews: [
        {
          outfit_id: 'outfit-ready',
          storage_path: 'workspace/outfits/outfit-ready/preview/v1.webp',
          status: 'ready',
          stale_at: null,
        },
        {
          outfit_id: 'outfit-stale',
          storage_path: 'workspace/outfits/outfit-stale/preview/v1.webp',
          status: 'error',
          stale_at: '2026-08-01T00:00:00Z',
        },
        {
          outfit_id: 'outfit-missing',
          storage_path: 'workspace/outfits/outfit-missing/preview/v1.webp',
          status: 'ready',
          stale_at: null,
        },
      ],
      outfitIds: new Set(['outfit-ready', 'outfit-stale']),
      objectPaths: [
        'workspace/outfits/outfit-ready/preview/v1.webp',
        'workspace/outfits/orphan/preview/v1.webp',
      ],
    })

    expect(report).toMatchObject({
      metadataCount: 3,
      objectCount: 2,
      readyCount: 2,
      errorCount: 1,
      staleCount: 1,
      orphanMetadata: [
        'workspace/outfits/outfit-missing/preview/v1.webp',
      ],
      missingReadyObjects: [
        'workspace/outfits/outfit-missing/preview/v1.webp',
      ],
      orphanObjects: ['workspace/outfits/orphan/preview/v1.webp'],
    })
  })
})
