import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

type Bindings = {
  SUPABASE_URL?: string
  SUPABASE_ANON_KEY?: string
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    service: 'mr-cha-dashboard-api',
    timestamp: new Date().toISOString(),
  })
})

app.get('/api/config-check', (c) => {
  const hasSupabaseUrl = Boolean(c.env.SUPABASE_URL)
  const hasSupabaseAnonKey = Boolean(c.env.SUPABASE_ANON_KEY)

  return c.json({
    ok: hasSupabaseUrl && hasSupabaseAnonKey,
    hasSupabaseUrl,
    hasSupabaseAnonKey,
  })
})

app.notFound((c) => c.json({ ok: false, message: 'Not Found' }, 404))

export const onRequest = handle(app)
