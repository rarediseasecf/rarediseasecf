import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEMO_HOSPITAL,
  RETIRED_DEMO_DOMAINS,
  demoHospitalsEnabled,
  isDemoHospitalEmail,
} from './demoHospital.js'
import { normalizeInstitutionalEmail } from './emailPolicy.js'

describe('demo hospital', () => {
  it('matches any address on the demo domain, case-insensitively', () => {
    assert.equal(isDemoHospitalEmail('billing@himalaya-demo.org'), true)
    assert.equal(isDemoHospitalEmail('  Billing@HIMALAYA-DEMO.ORG '), true)
    assert.equal(isDemoHospitalEmail('billing@himalaya-demo.org.evil.com'), false)
    assert.equal(isDemoHospitalEmail(null), false)
  })

  it('is enabled on devnet only', () => {
    assert.equal(demoHospitalsEnabled('devnet'), true)
    assert.equal(demoHospitalsEnabled('mainnet-beta'), false)
  })

  it('passes the institutional email policy and is not a retired domain', () => {
    const result = normalizeInstitutionalEmail(DEMO_HOSPITAL.contactEmail)
    assert.ok(!('error' in result))
    assert.equal(RETIRED_DEMO_DOMAINS.includes(DEMO_HOSPITAL.emailDomain), false)
  })
})
