import 'dotenv/config'
import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { AppError } from './errors.js'
import { runMilestoneSweeps, runStartupBootstrap } from './startup.js'

let config
let created
try {
  config = loadConfig()
  created = createApp(config)
} catch (err) {
  const message =
    err instanceof AppError
      ? err.message
      : err instanceof Error
        ? err.message
        : 'Invalid server configuration'
  console.error(JSON.stringify({ event: 'config_error', message }))
  process.exit(1)
}

const { app, stores } = created

let hospitalsBootstrapped = 0

try {
  hospitalsBootstrapped = await runStartupBootstrap(config, stores)
} catch (err) {
  console.error(
    JSON.stringify({
      event: 'bootstrap_error',
      name: err instanceof Error ? err.name : 'Unknown',
    })
  )
  process.exit(1)
}

const CLEANUP_INTERVAL_MS = 60_000

const cleanupTimer = setInterval(() => {
  stores.authService.cleanupExpired()
  stores.rateLimiter.cleanup()
}, CLEANUP_INTERVAL_MS)
cleanupTimer.unref?.()

const sweepTimer = setInterval(() => {
  void runMilestoneSweeps(stores)
}, config.expirySweepIntervalMs)
sweepTimer.unref?.()
void runMilestoneSweeps(stores)

const server = app.listen(config.port, () => {
  console.info(
    JSON.stringify({
      event: 'server_start',
      port: config.port,
      appOrigin: config.appOrigin,
      cluster: config.solana.cluster,
      encryptionKeyId: config.encryption.keyId,
      reviewersBootstrapped: config.reviewerBootstrapWallets.length,
      providersBootstrapped: config.providerBootstrapRecords.length,
      hospitalsBootstrapped,
    })
  )
})

async function shutdown() {
  server.close()
  await stores.dbHandle.client.end({ timeout: 5 })
  process.exit(0)
}

process.on('SIGINT', () => {
  void shutdown()
})
process.on('SIGTERM', () => {
  void shutdown()
})
