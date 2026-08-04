interface DeleteRequest {
  workspaceId: string
  outfitId: string
}

export interface OutfitDeleteHandlerDependencies {
  hasWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean>
  hasOutfit(workspaceId: string, outfitId: string): Promise<boolean>
  deleteOutfit(input: {
    userId: string
    workspaceId: string
    outfitId: string
  }): Promise<void>
}

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
}

function parseRequest(value: unknown): DeleteRequest | null {
  if (!isObject(value)) return null
  if (!isUuid(value.workspaceId) || !isUuid(value.outfitId)) return null
  return value as unknown as DeleteRequest
}

function databaseError(cause: unknown) {
  if (!isObject(cause) || typeof cause.code !== 'string') return null
  const message =
    typeof cause.message === 'string'
      ? cause.message
      : 'Outfit을 삭제하지 못했습니다.'

  if (cause.code === 'P0001') {
    return errorResponse(409, 'delete-blocked', message)
  }
  if (cause.code === 'P0002') {
    return errorResponse(404, 'outfit-not-found', message)
  }
  if (cause.code === '42501') {
    return errorResponse(403, 'workspace-forbidden', '이 옷장에 접근할 수 없습니다.')
  }
  return null
}

export async function handleOutfitDeleteRequest(
  request: Request,
  userId: string,
  dependencies: OutfitDeleteHandlerDependencies,
): Promise<Response> {
  if (request.method !== 'POST') {
    return errorResponse(405, 'method-not-allowed', 'POST 요청만 허용됩니다.')
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errorResponse(400, 'invalid-json', '요청 JSON을 읽을 수 없습니다.')
  }

  const input = parseRequest(payload)
  if (!input) {
    return errorResponse(400, 'invalid-request', 'Outfit 삭제 요청 값이 올바르지 않습니다.')
  }
  if (!(await dependencies.hasWorkspaceAccess(userId, input.workspaceId))) {
    return errorResponse(403, 'workspace-forbidden', '이 옷장에 접근할 수 없습니다.')
  }
  if (!(await dependencies.hasOutfit(input.workspaceId, input.outfitId))) {
    return errorResponse(404, 'outfit-not-found', 'Outfit을 찾을 수 없습니다.')
  }

  try {
    await dependencies.deleteOutfit({
      userId,
      workspaceId: input.workspaceId,
      outfitId: input.outfitId,
    })
    return Response.json({ deleted: true })
  } catch (cause) {
    return (
      databaseError(cause) ??
      errorResponse(500, 'delete-failed', 'Outfit을 삭제하지 못했습니다.')
    )
  }
}
