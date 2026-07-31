export const OUTFIT_PREVIEW_MAX_BYTES = 700 * 1024
export const OUTFIT_PREVIEW_WIDTH = 900
export const OUTFIT_PREVIEW_HEIGHT = 1200
export const OUTFIT_PREVIEW_CONTENT_TYPE = 'image/webp'

interface BeginRequest {
  action: 'begin'
  workspaceId: string
  outfitId: string
  widthPx: number
  heightPx: number
  bytes: number
  sourceFingerprint: string
}

interface FinalizeRequest {
  action: 'finalize'
  workspaceId: string
  outfitId: string
  previewId: string
}

interface CancelRequest {
  action: 'cancel'
  workspaceId: string
  outfitId: string
  previewId: string
}

type OutfitPreviewRequest = BeginRequest | FinalizeRequest | CancelRequest

export interface PreviewBeginResult {
  previewId: string
  storagePath: string
  compositionVersion: number
  abandonedStoragePaths: string[]
}

export interface PreviewFinalizeResult {
  previewId: string
  storagePath: string
  compositionVersion: number
  sourceFingerprint: string
  replacedStoragePaths: string[]
}

export interface OutfitPreviewHandlerDependencies {
  hasWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean>
  hasOutfit(workspaceId: string, outfitId: string): Promise<boolean>
  beginUpload(input: {
    workspaceId: string
    outfitId: string
    previewId: string
    widthPx: number
    heightPx: number
    bytes: number
    sourceFingerprint: string
  }): Promise<PreviewBeginResult>
  createSignedUploadUrl(
    storagePath: string,
  ): Promise<{ path: string; token: string }>
  finalizeUpload(input: {
    workspaceId: string
    outfitId: string
    previewId: string
  }): Promise<PreviewFinalizeResult>
  cancelUpload(input: {
    workspaceId: string
    outfitId: string
    previewId: string
  }): Promise<string | null>
  removeObjects(paths: string[]): Promise<void>
  createId(): string
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

function parseRequest(value: unknown): OutfitPreviewRequest | null {
  if (!isObject(value) || typeof value.action !== 'string') return null
  if (!isUuid(value.workspaceId) || !isUuid(value.outfitId)) return null

  if (value.action === 'begin') {
    if (
      value.widthPx !== OUTFIT_PREVIEW_WIDTH ||
      value.heightPx !== OUTFIT_PREVIEW_HEIGHT ||
      !Number.isInteger(value.bytes) ||
      Number(value.bytes) < 1 ||
      Number(value.bytes) > OUTFIT_PREVIEW_MAX_BYTES ||
      typeof value.sourceFingerprint !== 'string' ||
      !/^[0-9a-f]{64}$/.test(value.sourceFingerprint)
    ) {
      return null
    }
    return value as unknown as BeginRequest
  }

  if (
    (value.action === 'finalize' || value.action === 'cancel') &&
    isUuid(value.previewId)
  ) {
    return value as unknown as FinalizeRequest | CancelRequest
  }
  return null
}

async function safeRemove(
  dependencies: OutfitPreviewHandlerDependencies,
  paths: string[],
) {
  if (paths.length === 0) return
  try {
    await dependencies.removeObjects(paths)
  } catch {
    // Metadata remains authoritative; a later orphan sweep can retry cleanup.
  }
}

export async function handleOutfitPreviewRequest(
  request: Request,
  userId: string,
  dependencies: OutfitPreviewHandlerDependencies,
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
    return errorResponse(400, 'invalid-request', 'preview 요청 값이 올바르지 않습니다.')
  }
  if (!(await dependencies.hasWorkspaceAccess(userId, input.workspaceId))) {
    return errorResponse(403, 'workspace-forbidden', '이 옷장에 접근할 수 없습니다.')
  }
  if (!(await dependencies.hasOutfit(input.workspaceId, input.outfitId))) {
    return errorResponse(404, 'outfit-not-found', 'Outfit을 찾을 수 없습니다.')
  }

  try {
    if (input.action === 'begin') {
      const previewId = dependencies.createId()
      const begun = await dependencies.beginUpload({
        workspaceId: input.workspaceId,
        outfitId: input.outfitId,
        previewId,
        widthPx: input.widthPx,
        heightPx: input.heightPx,
        bytes: input.bytes,
        sourceFingerprint: input.sourceFingerprint,
      })
      await safeRemove(dependencies, begun.abandonedStoragePaths)
      try {
        const ticket = await dependencies.createSignedUploadUrl(
          begun.storagePath,
        )
        return Response.json({
          previewId: begun.previewId,
          storagePath: begun.storagePath,
          compositionVersion: begun.compositionVersion,
          token: ticket.token,
          contentType: OUTFIT_PREVIEW_CONTENT_TYPE,
        })
      } catch (cause) {
        const path = await dependencies.cancelUpload({
          workspaceId: input.workspaceId,
          outfitId: input.outfitId,
          previewId,
        })
        await safeRemove(dependencies, path ? [path] : [])
        throw cause
      }
    }

    if (input.action === 'finalize') {
      const finalized = await dependencies.finalizeUpload(input)
      await safeRemove(dependencies, finalized.replacedStoragePaths)
      return Response.json(finalized)
    }

    const path = await dependencies.cancelUpload(input)
    await safeRemove(dependencies, path ? [path] : [])
    return Response.json({ cancelled: true })
  } catch {
    return errorResponse(500, 'preview-write-failed', '착장 preview를 저장하지 못했습니다.')
  }
}
