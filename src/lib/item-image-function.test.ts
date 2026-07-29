import { describe, expect, it, vi } from 'vitest'
import {
  handleItemImageRequest,
  type ItemImageHandlerDependencies,
} from '../../supabase/functions/closet-item-image/image-handler'

const workspaceId = '00000000-0000-0000-0000-000000000003'
const itemId = '00000000-0000-0000-0000-000000000101'
const imageId = '00000000-0000-0000-0000-000000000201'
const storagePath =
  `${workspaceId}/items/${itemId}/cutout/${imageId}.webp`

function dependencies(): ItemImageHandlerDependencies {
  return {
    hasWorkspaceAccess: vi.fn(async () => true),
    hasItem: vi.fn(async () => true),
    createId: vi.fn(() => imageId),
    beginUpload: vi.fn(async () => ({
      imageId,
      storagePath,
      abandonedStoragePaths: ['old-pending.webp'],
    })),
    createSignedUploadUrl: vi.fn(async (path) => ({
      path,
      token: 'signed-token',
    })),
    finalizeUpload: vi.fn(async () => ({
      imageId,
      storagePath,
      widthPx: 800,
      heightPx: 1200,
      replacedStoragePaths: ['old-ready.webp'],
    })),
    cancelUpload: vi.fn(async () => storagePath),
    removeObjects: vi.fn(async () => undefined),
  }
}

function request(body: unknown) {
  return new Request('https://example.test/closet-item-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('closet item image function contract', () => {
  it('creates a pending row before returning a signed upload ticket', async () => {
    const deps = dependencies()
    const response = await handleItemImageRequest(
      request({
        action: 'begin',
        workspaceId,
        itemId,
        widthPx: 800,
        heightPx: 1200,
        bytes: 320000,
      }),
      'user-id',
      deps,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      imageId,
      storagePath,
      token: 'signed-token',
      contentType: 'image/webp',
    })
    expect(deps.beginUpload).toHaveBeenCalledWith({
      workspaceId,
      itemId,
      imageId,
      widthPx: 800,
      heightPx: 1200,
      bytes: 320000,
    })
    expect(deps.removeObjects).toHaveBeenCalledWith(['old-pending.webp'])
  })

  it('rejects unauthorized workspaces before creating metadata', async () => {
    const deps = dependencies()
    vi.mocked(deps.hasWorkspaceAccess).mockResolvedValue(false)

    const response = await handleItemImageRequest(
      request({
        action: 'begin',
        workspaceId,
        itemId,
        widthPx: 800,
        heightPx: 1200,
        bytes: 320000,
      }),
      'user-id',
      deps,
    )

    expect(response.status).toBe(403)
    expect(deps.beginUpload).not.toHaveBeenCalled()
  })

  it('cancels the pending row when signed URL creation fails', async () => {
    const deps = dependencies()
    vi.mocked(deps.createSignedUploadUrl).mockRejectedValue(
      new Error('sign failed'),
    )

    const response = await handleItemImageRequest(
      request({
        action: 'begin',
        workspaceId,
        itemId,
        widthPx: 800,
        heightPx: 1200,
        bytes: 320000,
      }),
      'user-id',
      deps,
    )

    expect(response.status).toBe(500)
    expect(deps.cancelUpload).toHaveBeenCalledWith({
      workspaceId,
      itemId,
      imageId,
    })
    expect(deps.removeObjects).toHaveBeenCalledWith([storagePath])
  })

  it('promotes the new ready row before cleaning the replaced object', async () => {
    const deps = dependencies()
    const response = await handleItemImageRequest(
      request({
        action: 'finalize',
        workspaceId,
        itemId,
        imageId,
      }),
      'user-id',
      deps,
    )

    expect(response.status).toBe(200)
    expect(deps.finalizeUpload).toHaveBeenCalledWith({
      action: 'finalize',
      workspaceId,
      itemId,
      imageId,
    })
    expect(deps.removeObjects).toHaveBeenCalledWith(['old-ready.webp'])
  })
})
