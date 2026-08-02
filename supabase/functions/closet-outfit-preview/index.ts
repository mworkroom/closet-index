import '@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '@supabase/supabase-js/cors'
import { withSupabase } from '@supabase/server'
import {
  handleOutfitPreviewRequest,
  type PreviewBeginResult,
  type PreviewFinalizeResult,
} from './preview-handler.ts'

const BUCKET = 'closet-images'
const ALLOWED_ORIGINS = new Set([
  'https://mworkroom.github.io',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
])

function requestCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin')
  const headers = { ...corsHeaders, Vary: 'Origin' }
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    delete headers['Access-Control-Allow-Origin']
    return headers
  }
  return { ...headers, 'Access-Control-Allow-Origin': origin }
}

function withCors(response: Response, request: Request) {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(requestCorsHeaders(request))) {
    headers.set(name, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const authenticatedFetch = withSupabase(
  { auth: 'user' },
  async (request, context) => {
    const userId = context.userClaims?.id
    if (typeof userId !== 'string') {
      return Response.json(
        { error: { code: 'internal-error', message: '인증 사용자 정보를 확인할 수 없습니다.' } },
        { status: 500 },
      )
    }

    return handleOutfitPreviewRequest(request, userId, {
      createId: () => crypto.randomUUID(),
      async hasWorkspaceAccess(memberId, workspaceId) {
        const { data, error } = await context.supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('workspace_id', workspaceId)
          .eq('user_id', memberId)
          .maybeSingle()
        if (error) throw error
        return Boolean(data)
      },
      async hasOutfit(workspaceId, outfitId) {
        const { data, error } = await context.supabase
          .from('closet_outfits')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('id', outfitId)
          .maybeSingle()
        if (error) throw error
        return Boolean(data)
      },
      async beginUpload(input) {
        const { data, error } = await context.supabaseAdmin.rpc(
          'begin_closet_outfit_preview_upload',
          {
            p_workspace_id: input.workspaceId,
            p_outfit_id: input.outfitId,
            p_preview_id: input.previewId,
            p_width_px: input.widthPx,
            p_height_px: input.heightPx,
            p_bytes: input.bytes,
            p_source_fingerprint: input.sourceFingerprint,
          },
        )
        if (error) throw error
        const row = (Array.isArray(data) ? data[0] : data) as {
          preview_id: string
          storage_path: string
          composition_version: number
          abandoned_storage_paths: string[] | null
        } | null
        if (!row) throw new Error('pending preview row missing')
        return {
          previewId: row.preview_id,
          storagePath: row.storage_path,
          compositionVersion: row.composition_version,
          abandonedStoragePaths: row.abandoned_storage_paths ?? [],
        } satisfies PreviewBeginResult
      },
      async createSignedUploadUrl(storagePath) {
        const { data, error } = await context.supabaseAdmin.storage
          .from(BUCKET)
          .createSignedUploadUrl(storagePath, { upsert: false })
        if (error) throw error
        return data
      },
      async finalizeUpload(input) {
        const { data, error } = await context.supabaseAdmin.rpc(
          'finalize_closet_outfit_preview_upload',
          {
            p_workspace_id: input.workspaceId,
            p_outfit_id: input.outfitId,
            p_preview_id: input.previewId,
          },
        )
        if (error) throw error
        const row = (Array.isArray(data) ? data[0] : data) as {
          preview_id: string
          storage_path: string
          composition_version: number
          source_fingerprint: string
          replaced_storage_paths: string[] | null
        } | null
        if (!row) throw new Error('ready preview row missing')
        return {
          previewId: row.preview_id,
          storagePath: row.storage_path,
          compositionVersion: row.composition_version,
          sourceFingerprint: row.source_fingerprint,
          replacedStoragePaths: row.replaced_storage_paths ?? [],
        } satisfies PreviewFinalizeResult
      },
      async cancelUpload(input) {
        const { data, error } = await context.supabaseAdmin.rpc(
          'cancel_closet_outfit_preview_upload',
          {
            p_workspace_id: input.workspaceId,
            p_outfit_id: input.outfitId,
            p_preview_id: input.previewId,
          },
        )
        if (error) throw error
        return typeof data === 'string' ? data : null
      },
      async deleteOutfit(input) {
        const { data, error } = await context.supabaseAdmin.rpc(
          'delete_closet_outfit_if_unworn',
          {
            p_user_id: input.userId,
            p_workspace_id: input.workspaceId,
            p_outfit_id: input.outfitId,
          },
        )
        if (error) throw error
        return Array.isArray(data)
          ? data.filter((path): path is string => typeof path === 'string')
          : []
      },
      async removeObjects(paths) {
        const { error } = await context.supabaseAdmin.storage
          .from(BUCKET)
          .remove(paths)
        if (error) throw error
      },
    })
  },
)

export default {
  async fetch(request: Request): Promise<Response> {
    const origin = request.headers.get('origin')
    if (request.method === 'OPTIONS') {
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return Response.json(
          { error: { code: 'origin-forbidden', message: '허용되지 않은 출처입니다.' } },
          { status: 403 },
        )
      }
      return new Response('ok', { headers: requestCorsHeaders(request) })
    }
    return withCors(await authenticatedFetch(request), request)
  },
}
