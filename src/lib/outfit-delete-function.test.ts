import { describe, expect, it, vi } from 'vitest'
import {
  handleOutfitDeleteRequest,
  type OutfitDeleteHandlerDependencies,
} from '../../supabase/functions/closet-outfit-delete/delete-handler'

const userId = '10000000-0000-0000-0000-000000000001'
const workspaceId = '20000000-0000-0000-0000-000000000002'
const outfitId = '30000000-0000-0000-0000-000000000003'

function dependencies(
  overrides: Partial<OutfitDeleteHandlerDependencies> = {},
): OutfitDeleteHandlerDependencies {
  return {
    hasWorkspaceAccess: vi.fn().mockResolvedValue(true),
    hasOutfit: vi.fn().mockResolvedValue(true),
    deleteOutfit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function request(body: unknown, method = 'POST') {
  return new Request('https://example.test/closet-outfit-delete', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

describe('closet-outfit-delete handler', () => {
  it('rejects malformed identifiers before repository access', async () => {
    const deps = dependencies()
    const response = await handleOutfitDeleteRequest(
      request({ workspaceId: 'workspace', outfitId }),
      userId,
      deps,
    )

    expect(response.status).toBe(400)
    expect(deps.hasWorkspaceAccess).not.toHaveBeenCalled()
  })

  it('keeps workspace access checks at the authenticated boundary', async () => {
    const deps = dependencies({
      hasWorkspaceAccess: vi.fn().mockResolvedValue(false),
    })
    const response = await handleOutfitDeleteRequest(
      request({ workspaceId, outfitId }),
      userId,
      deps,
    )

    expect(response.status).toBe(403)
    expect(deps.deleteOutfit).not.toHaveBeenCalled()
  })

  it('maps the protected Wear Log conflict to a user-facing 409', async () => {
    const deps = dependencies({
      deleteOutfit: vi.fn().mockRejectedValue({
        code: 'P0001',
        message: '착용 기록이 있는 Outfit은 삭제할 수 없습니다.',
      }),
    })
    const response = await handleOutfitDeleteRequest(
      request({ workspaceId, outfitId }),
      userId,
      deps,
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'delete-blocked',
        message: '착용 기록이 있는 Outfit은 삭제할 수 없습니다.',
      },
    })
  })

  it('deletes through the service boundary without Storage cleanup', async () => {
    const deps = dependencies()
    const response = await handleOutfitDeleteRequest(
      request({ workspaceId, outfitId }),
      userId,
      deps,
    )

    expect(response.status).toBe(200)
    expect(deps.deleteOutfit).toHaveBeenCalledWith({
      userId,
      workspaceId,
      outfitId,
    })
    await expect(response.json()).resolves.toEqual({ deleted: true })
  })
})
