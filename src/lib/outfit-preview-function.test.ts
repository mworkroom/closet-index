import { describe, expect, it, vi } from 'vitest'
import {
  handleOutfitPreviewRequest,
  type OutfitPreviewHandlerDependencies,
} from '../../supabase/functions/closet-outfit-preview/preview-handler'

const workspaceId = '00000000-0000-0000-0000-000000000003'
const outfitId = '00000000-0000-0000-0000-000000000101'
const previewId = '00000000-0000-0000-0000-000000000201'
const fingerprint = 'a'.repeat(64)
const storagePath = `${workspaceId}/outfits/${outfitId}/preview/v2.webp`

function dependencies(): OutfitPreviewHandlerDependencies {
  return {
    hasWorkspaceAccess: vi.fn(async () => true),
    hasOutfit: vi.fn(async () => true),
    createId: vi.fn(() => previewId),
    beginUpload: vi.fn(async () => ({
      previewId,
      storagePath,
      compositionVersion: 2,
      abandonedStoragePaths: ['old-pending.webp'],
    })),
    createSignedUploadUrl: vi.fn(async (path) => ({
      path,
      token: 'signed-token',
    })),
    finalizeUpload: vi.fn(async () => ({
      previewId,
      storagePath,
      compositionVersion: 2,
      sourceFingerprint: fingerprint,
      replacedStoragePaths: ['old-ready.webp'],
    })),
    cancelUpload: vi.fn(async () => storagePath),
    deleteOutfit: vi.fn(async () => [storagePath]),
    removeObjects: vi.fn(async () => undefined),
  }
}

function request(body: unknown) {
  return new Request('https://example.test/closet-outfit-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('closet outfit preview function contract', () => {
  it('creates a versioned pending row before returning a signed ticket', async () => {
    const deps = dependencies()
    const response = await handleOutfitPreviewRequest(
      request({
        action: 'begin',
        workspaceId,
        outfitId,
        widthPx: 900,
        heightPx: 1200,
        bytes: 320000,
        sourceFingerprint: fingerprint,
      }),
      'user-id',
      deps,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      previewId,
      storagePath,
      compositionVersion: 2,
      token: 'signed-token',
      contentType: 'image/webp',
    })
    expect(deps.removeObjects).toHaveBeenCalledWith(['old-pending.webp'])
  })

  it('rejects workspaces that do not belong to the caller', async () => {
    const deps = dependencies()
    vi.mocked(deps.hasWorkspaceAccess).mockResolvedValue(false)

    const response = await handleOutfitPreviewRequest(
      request({
        action: 'begin',
        workspaceId,
        outfitId,
        widthPx: 900,
        heightPx: 1200,
        bytes: 320000,
        sourceFingerprint: fingerprint,
      }),
      'user-id',
      deps,
    )

    expect(response.status).toBe(403)
    expect(deps.beginUpload).not.toHaveBeenCalled()
  })

  it('promotes the new ready preview before cleaning the previous object', async () => {
    const deps = dependencies()
    const response = await handleOutfitPreviewRequest(
      request({
        action: 'finalize',
        workspaceId,
        outfitId,
        previewId,
      }),
      'user-id',
      deps,
    )

    expect(response.status).toBe(200)
    expect(deps.finalizeUpload).toHaveBeenCalledWith({
      action: 'finalize',
      workspaceId,
      outfitId,
      previewId,
    })
    expect(deps.removeObjects).toHaveBeenCalledWith(['old-ready.webp'])
  })

  it('cancels pending metadata when signed URL creation fails', async () => {
    const deps = dependencies()
    vi.mocked(deps.createSignedUploadUrl).mockRejectedValue(
      new Error('sign failed'),
    )

    const response = await handleOutfitPreviewRequest(
      request({
        action: 'begin',
        workspaceId,
        outfitId,
        widthPx: 900,
        heightPx: 1200,
        bytes: 320000,
        sourceFingerprint: fingerprint,
      }),
      'user-id',
      deps,
    )

    expect(response.status).toBe(500)
    expect(deps.cancelUpload).toHaveBeenCalledWith({
      workspaceId,
      outfitId,
      previewId,
    })
  })

  it('deletes the Outfit metadata first and then removes returned preview objects', async () => {
    const deps = dependencies()
    const response = await handleOutfitPreviewRequest(
      request({ action: 'delete', workspaceId, outfitId }),
      'user-id',
      deps,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ deleted: true })
    expect(deps.deleteOutfit).toHaveBeenCalledWith({
      userId: 'user-id',
      workspaceId,
      outfitId,
    })
    expect(deps.removeObjects).toHaveBeenCalledWith([storagePath])
  })

  it('returns a conflict when Wear Logs block Outfit deletion', async () => {
    const deps = dependencies()
    vi.mocked(deps.deleteOutfit).mockRejectedValue(
      Object.assign(new Error('착용 기록이 있는 Outfit은 삭제할 수 없습니다.'), {
        code: 'P0001',
      }),
    )

    const response = await handleOutfitPreviewRequest(
      request({ action: 'delete', workspaceId, outfitId }),
      'user-id',
      deps,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'delete-blocked' },
    })
  })
})
