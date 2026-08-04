import '@supabase/functions-js/edge-runtime.d.ts'
import { corsHeaders } from '@supabase/supabase-js/cors'
import { withSupabase } from '@supabase/server'
import { handleOutfitDeleteRequest } from './delete-handler.ts'

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
        {
          error: {
            code: 'internal-error',
            message: '인증 사용자 정보를 확인할 수 없습니다.',
          },
        },
        { status: 500 },
      )
    }

    return handleOutfitDeleteRequest(request, userId, {
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
      async deleteOutfit(input) {
        const { error } = await context.supabaseAdmin.rpc(
          'delete_closet_outfit_if_unworn',
          {
            p_user_id: input.userId,
            p_workspace_id: input.workspaceId,
            p_outfit_id: input.outfitId,
          },
        )
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
          {
            error: {
              code: 'origin-forbidden',
              message: '허용되지 않은 출처입니다.',
            },
          },
          { status: 403, headers: requestCorsHeaders(request) },
        )
      }
      return new Response('ok', { headers: requestCorsHeaders(request) })
    }

    return withCors(await authenticatedFetch(request), request)
  },
}
