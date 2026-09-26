/**
 * Vercel Function entry: the Express app without app.listen or timers.
 * Timers are replaced by the /api/cron/sweep Vercel Cron job (vercel.json).
 */
import { timingSafeEqual } from 'node:crypto'
import express from 'express'
import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { runMilestoneSweeps, runStartupBootstrap } from './startup.js'

const config = loadConfig()
const { app, stores } = createApp(config)

let ready: Promise<unknown> | null = null

function ensureReady(): Promise<unknown> {
  ready ??= runStartupBootstrap(config, stores).catch(err => {
    ready = null
    throw err
  })
  return ready
}

function isCronRequest(header: string | undefined): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret || !header) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(header)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const handler = express()
handler.disable('x-powered-by')

handler.use(async (_req, res, next) => {
  try {
    await ensureReady()
    next()
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'bootstrap_error',
        name: err instanceof Error ? err.name : 'Unknown',
      })
    )
    res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Service is starting up. Try again shortly.' },
    })
  }
})

handler.get('/api/cron/sweep', async (req, res) => {
  if (!isCronRequest(req.headers.authorization)) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized.' } })
    return
  }
  await runMilestoneSweeps(stores)
  res.status(200).json({ ok: true })
})

handler.use(app)

export default handler
