import { createClient } from 'npm:@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function serverKey() {
  const direct = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (direct) return direct
  const named = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (named) {
    const parsed = JSON.parse(named)
    return parsed.default ?? Object.values(parsed)[0]
  }
  return null
}

export function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = serverKey()
  if (!url || !key) throw new Error('Missing Supabase server environment variables')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function authenticatedUser(req: Request) {
  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) throw new Error('Missing bearer token')
  const admin = adminClient()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new Error('Invalid or expired session')
  return { user: data.user, admin }
}

export function shuffle<T>(input: T[]): T[] {
  const a = [...input]
  for (let i = a.length - 1; i > 0; i--) {
    const bytes = new Uint32Array(1)
    crypto.getRandomValues(bytes)
    const j = bytes[0] % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function handleOptions(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return null
}
