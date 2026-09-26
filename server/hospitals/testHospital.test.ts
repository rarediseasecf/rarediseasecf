import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  TEST_HOSPITAL,
  isTestHospitalEmail,
  testHospitalEnabled,
} from './testHospital.js'
import { normalizeInstitutionalEmail } from './emailPolicy.js'

describe('test hospital inbox', () => {
  it('matches aa@aa.aa case-insensitively', () => {
    assert.equal(isTestHospitalEmail('aa@aa.aa'), true)
    assert.equal(isTestHospitalEmail('  AA@AA.AA '), true)
    assert.equal(isTestHospitalEmail('verify@democare.hospital'), false)
  })

  it('is enabled on devnet only', () => {
    assert.equal(testHospitalEnabled('devnet'), true)
    assert.equal(testHospitalEnabled('mainnet-beta'), false)
  })

  it('passes institutional email validation', () => {
    const result = normalizeInstitutionalEmail(TEST_HOSPITAL.contactEmail)
    assert.ok(!('error' in result))
  })
})
