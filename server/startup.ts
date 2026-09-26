import type { ServerConfig } from './config.js'
import type { AppStores } from './app.js'
import { bootstrapRegistries } from './reviewer/bootstrap.js'
import { bootstrapHospitals } from './hospitals/bootstrap.js'
import { testHospitalEnabled } from './hospitals/testHospital.js'

/** Seed reviewer/provider registries and the hospital whitelist. Returns hospitals seeded. */
export async function runStartupBootstrap(
  config: ServerConfig,
  stores: AppStores
): Promise<number> {
  await bootstrapRegistries(
    stores.dbHandle.db,
    config.reviewerBootstrapWallets,
    config.providerBootstrapRecords
  )
  const hospitalsBootstrapped = await bootstrapHospitals(
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
  return hospitalsBootstrapped
}

let sweeping = false

/** Release expired campaigns and retry reached-but-unpaid milestones. */
export async function runMilestoneSweeps(stores: AppStores): Promise<void> {
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
