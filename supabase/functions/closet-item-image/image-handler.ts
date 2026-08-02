export const ITEM_IMAGE_MAX_BYTES = 700 * 1024
export const ITEM_IMAGE_MAX_DIMENSION = 4096
export const ITEM_IMAGE_CONTENT_TYPE = 'image/webp'

interface BeginRequest {
  action: 'begin'
  workspaceId: string
  itemId: string
  widthPx: number
  heightPx: number
  bytes: number
}

interface FinalizeRequest {
  action: 'finalize'
  workspaceId: string
  itemId: string
  imageId: string
}

interface CancelRequest {
  action: 'cancel'
  workspaceId: string
  itemId: string
  imageId: string
}

interface DeleteRequest {
  action: 'delete'
  workspaceId: string
  itemId: string
}

type ItemImageRequest =
  | BeginRequest
  | FinalizeRequest
  | CancelRequest
  | DeleteRequest

export interface BeginUploadResult {
  imageId: string
  storagePath: string
  abandonedStoragePaths: string[]
}

export interface FinalizeUploadResult {
  imageId: string
  storagePath: string
  widthPx: number
  heightPx: number
  replacedStoragePaths: string[]
}

export interface ItemImageHandlerDependencies {
  hasWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean>
  hasItem(workspaceId: string, itemId: string): Promise<boolean>
  beginUpload(input: {
    workspaceId: string
    itemId: string
    imageId: string
    widthPx: number
    heightPx: number
    bytes: number
  }): Promise<BeginUploadResult>
  createSignedUploadUrl(
    storagePath: string,
  ): Promise<{ path: string; token: string }>
  finalizeUpload(input: {
    workspaceId: string
    itemId: string
    imageId: string
  }): Promise<FinalizeUploadResult>
  cancelUpload(input: {
    workspaceId: string
    itemId: string
    imageId: string
  }): Promise<string | null>
  deleteItem(input: {
    userId: string
    workspaceId: string
    itemId: string
  }): Promise<string[]>
  removeObjects(paths: string[]): Promise<void>
  createId(): string
}

function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
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

function positiveInteger(value: unknown, max: number): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= max
}

function parseRequest(value: unknown): ItemImageRequest | null {
  if (!isObject(value) || typeof value.action !== 'string') return null
  if (!isUuid(value.workspaceId) || !isUuid(value.itemId)) return null

  if (value.action === 'delete') return value as unknown as DeleteRequest

  if (value.action === 'begin') {
    if (
      !positiveInteger(value.widthPx, ITEM_IMAGE_MAX_DIMENSION) ||
      !positiveInteger(value.heightPx, ITEM_IMAGE_MAX_DIMENSION) ||
      !positiveInteger(value.bytes, ITEM_IMAGE_MAX_BYTES)
    ) {
      return null
    }
    return value as unknown as BeginRequest
  }

  if (
    (value.action === 'finalize' || value.action === 'cancel') &&
    isUuid(value.imageId)
  ) {
    return value as unknown as FinalizeRequest | CancelRequest
  }

  return null
}

function deleteConflictMessage(cause: unknown): string | null {
  if (!isObject(cause) || cause.code !== 'P0001') return null
  return typeof cause.message === 'string'
    ? cause.message
    : '연결된 기록이 있어 삭제할 수 없습니다.'
}

async function safeRemove(
  dependencies: ItemImageHandlerDependencies,
  paths: string[],
) {
  if (paths.length === 0) return
  try {
    await dependencies.removeObjects(paths)
  } catch {
    // The database state remains valid. A later orphan sweep can retry cleanup.
  }
}

export async function handleItemImageRequest(
  request: Request,
  userId: string,
  dependencies: ItemImageHandlerDependencies,
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
    return errorResponse(
      400,
      'invalid-request',
      '이미지 요청 값이 올바르지 않습니다.',
    )
  }

  if (!(await dependencies.hasWorkspaceAccess(userId, input.workspaceId))) {
    return errorResponse(
      403,
      'workspace-forbidden',
      '이 workspace의 이미지를 변경할 권한이 없습니다.',
    )
  }
  if (!(await dependencies.hasItem(input.workspaceId, input.itemId))) {
    return errorResponse(404, 'item-not-found', 'Item을 찾을 수 없습니다.')
  }

  try {
    if (input.action === 'delete') {
      const storagePaths = await dependencies.deleteItem({
        userId,
        workspaceId: input.workspaceId,
        itemId: input.itemId,
      })
      await safeRemove(dependencies, storagePaths)
      return Response.json({ deleted: true })
    }

    if (input.action === 'begin') {
      const imageId = dependencies.createId()
      const pending = await dependencies.beginUpload({
        workspaceId: input.workspaceId,
        itemId: input.itemId,
        imageId,
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        bytes: input.bytes,
      })
      try {
        const signed = await dependencies.createSignedUploadUrl(
          pending.storagePath,
        )
        await safeRemove(dependencies, pending.abandonedStoragePaths)
        return Response.json({
          imageId: pending.imageId,
          storagePath: signed.path,
          token: signed.token,
          contentType: ITEM_IMAGE_CONTENT_TYPE,
        })
      } catch (cause) {
        const cancelledPath = await dependencies.cancelUpload({
          workspaceId: input.workspaceId,
          itemId: input.itemId,
          imageId,
        })
        await safeRemove(
          dependencies,
          cancelledPath ? [cancelledPath] : [],
        )
        throw cause
      }
    }

    if (input.action === 'finalize') {
      const finalized = await dependencies.finalizeUpload(input)
      await safeRemove(dependencies, finalized.replacedStoragePaths)
      return Response.json({
        imageId: finalized.imageId,
        storagePath: finalized.storagePath,
        widthPx: finalized.widthPx,
        heightPx: finalized.heightPx,
      })
    }

    const storagePath = await dependencies.cancelUpload(input)
    await safeRemove(dependencies, storagePath ? [storagePath] : [])
    return Response.json({ cancelled: true })
  } catch (cause) {
    const conflict = deleteConflictMessage(cause)
    if (conflict) {
      return errorResponse(409, 'delete-blocked', conflict)
    }
    return errorResponse(
      500,
      'image-operation-failed',
      '이미지 저장 작업을 완료하지 못했습니다.',
    )
  }
}
