import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { app } from './app'

function loadDevVars() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  const candidates = [
    path.resolve(process.cwd(), '.dev.vars'),
    path.resolve(__dirname, '.dev.vars'),
  ]

  const envPath = candidates.find((p) => fs.existsSync(p))
  if (!envPath) return

  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

loadDevVars()

const port = Number(process.env.PORT || '8788')

console.log(`[api] starting hono dev server on http://127.0.0.1:${port}`)

serve({
  fetch: app.fetch,
  port,
  hostname: '127.0.0.1',
})
