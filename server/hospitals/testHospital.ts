/**
 * Public test inbox: lets anyone try the full flow without a real hospital mailbox.
 * The submitter receives the hospital verify link directly, so this must never be
 * enabled where money is real — devnet only.
 */
import type { SolanaCluster } from '../config.js'
import type { HospitalBootstrapRecord } from './bootstrap.js'

export const TEST_HOSPITAL_EMAIL = 'aa@aa.aa'

export const TEST_HOSPITAL: HospitalBootstrapRecord = {
  displayName: 'Test Hospital (Devnet only)',
  emailDomain: 'aa.aa',
  contactEmail: TEST_HOSPITAL_EMAIL,
}

export function isTestHospitalEmail(email: string): boolean {
  return email.trim().toLowerCase() === TEST_HOSPITAL_EMAIL
}

export function testHospitalEnabled(cluster: SolanaCluster): boolean {
  return cluster === 'devnet'
}
