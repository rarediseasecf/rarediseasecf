import 'dotenv/config'
import { loadConfig } from './config.js'
import { createApp } from './app.js'
import { AppError } from './errors.js'
import { bootstrapRegistries } from './reviewer/bootstrap.js'
import { bootstrapHospitals } from './hospitals/bootstrap.js'
import { testHospitalEnabled } from './hospitals/testHospital.js'

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
  await bootstrapRegistries(
    stores.dbHandle.db,
    config.reviewerBootstrapWallets,
    config.providerBootstrapRecords
  )
  hospitalsBootstrapped = await bootstrapHospitals(
    stores.dbHandle.db,
    config.hospitalBootstrapRecords,
    { includeTestHospital: testHospitalEnabled(config.solana.cluster) }
  )
  if (config.reviewerBootstrapWallets.length === 0) {
    console.warn(
      JSON.stringify({
        event: 'reviewer_bootstrap_empty',
        message:
          'REVIEWER_BOOTSTRAP_WALLETS is empty — reviewer access will be denied until configured.',
      })
    )
  }
  if (config.providerBootstrapRecords.length === 0) {
    console.warn(
      JSON.stringify({
        event: 'provider_bootstrap_empty',
        message:
          'PROVIDER_BOOTSTRAP_RECORDS is empty — case approval will be unavailable until configured.',
      })
    )
  }
  if (hospitalsBootstrapped === 0) {
    console.warn(
      JSON.stringify({
        event: 'hospital_bootstrap_empty',
        message: 'No hospital whitelist rows were seeded.',
      })
    )
  }
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

let sweeping = false
async function sweepExpiredCampaigns() {
  if (sweeping) return
  sweeping = true
  try {
    const result = await stores.milestoneService.sweepExpiredCampaigns()
    if (result.released.length || result.failed.length) {
      console.info(JSON.stringify({ event: 'expiry_sweep', ...result }))
    }
    const milestones = await stores.milestoneService.sweepReachedMilestones()
    if (milestones.released.length || milestones.failed.length) {
      console.info(JSON.stringify({ event: 'milestone_sweep', ...milestones }))
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        event: 'expiry_sweep_error',
        name: err instanceof Error ? err.name : 'Unknown',
      })
    )
  } finally {
    sweeping = false
  }
}
const sweepTimer = setInterval(() => {
  void sweepExpiredCampaigns()
}, config.expirySweepIntervalMs)
sweepTimer.unref?.()
void sweepExpiredCampaigns()

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
