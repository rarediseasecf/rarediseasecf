/**
 * The one fictional demo institution, seeded on Devnet only. Its domain is not
 * ours, so it must never be active where money is real, and verification links
 * addressed to it are never emailed.
 */
import type { SolanaCluster } from '../config.js'
import type { HospitalBootstrapRecord } from './bootstrap.js'

export const DEMO_HOSPITAL: HospitalBootstrapRecord = {
  displayName: "Himalaya Children's Hospital (Demo)",
  emailDomain: 'himalaya-demo.org',
  contactEmail: 'billing@himalaya-demo.org',
}

/** Earlier demo/test institutions — always deactivated. */
export const RETIRED_DEMO_DOMAINS = [
  'aa.aa',
  'democare.hospital',
  'northlake-rdc.org',
  'summitpsc.edu',
]

export function demoHospitalsEnabled(cluster: SolanaCluster): boolean {
  return cluster === 'devnet'
}

export function isDemoHospitalEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const domain = email.trim().toLowerCase().split('@')[1]
  return domain === DEMO_HOSPITAL.emailDomain
}
