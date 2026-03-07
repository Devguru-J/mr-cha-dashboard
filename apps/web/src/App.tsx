import { useEffect, useState } from 'react'
import './App.css'
import { hasSupabaseConfig } from './lib/supabase'

type HealthResponse = {
  ok: boolean
  service: string
  timestamp: string
}

function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        setError(null)
        const res = await fetch('/api/health')
        if (!res.ok) {
          throw new Error(`API request failed: ${res.status}`)
        }
        const data = (await res.json()) as HealthResponse
        setHealth(data)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
      }
    }
    void run()
  }, [])

  return (
    <main className="container">
      <header>
        <p className="eyebrow">MR CHA Dashboard</p>
        <h1>Bootstrap Ready</h1>
        <p className="subtitle">
          Bun + React + Supabase + Hono + Cloudflare Pages Functions
        </p>
      </header>

      <section className="panel">
        <h2>API Health</h2>
        {error ? (
          <p className="error">{error}</p>
        ) : health ? (
          <dl>
            <div>
              <dt>Status</dt>
              <dd>{health.ok ? 'OK' : 'FAIL'}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{health.service}</dd>
            </div>
            <div>
              <dt>Timestamp</dt>
              <dd>{health.timestamp}</dd>
            </div>
          </dl>
        ) : (
          <p>Loading...</p>
        )}
      </section>

      <section className="panel">
        <h2>Supabase Config</h2>
        <p>
          {hasSupabaseConfig
            ? 'Configured'
            : 'Missing .env values: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY'}
        </p>
      </section>

      <p className="next">
        Next step: implement upload and query endpoints for lease/rent residual
        values.
      </p>
    </main>
  )
}

export default App
