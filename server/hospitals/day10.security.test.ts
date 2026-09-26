/**
 * Day 10 — hospital whitelist validation + settle helpers + sniff/secrets.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AppError } from '../errors.js'
import { validateHospitalWhitelistInput } from './hospitalWhitelistValidation.js'
import {
  pickHighestSettleCandidate,
  MILESTONE_STATUS,
} from '../milestones/milestoneState.js'
import {
  mimeMatchesSniff,
  sniffDocumentBuffer,
} from '../cases/documentSniff.js'
import { secretsEqual } from '../security/secretsEqual.js'

describe('hospital whitelist validation', () => {
  it('rejects personal domains', () => {
    assert.throws(
      () =>
        validateHospitalWhitelistInput({
          displayName: 'Bad',
          emailDomain: 'gmail.com',
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === 'INVALID_HOSPITAL_EMAIL'
    )
  })

  it('rejects contact domain mismatch', () => {
    assert.throws(
      () =>
        validateHospitalWhitelistInput({
          displayName: 'Clinic',
          emailDomain: 'clinic.hospital',
          contactEmail: 'verify@other.hospital',
        }),
      (err: unknown) =>
        err instanceof AppError && err.code === 'INVALID_HOSPITAL'
    )
  })

  it('accepts institutional domain and synthesizes contact', () => {
    const v = validateHospitalWhitelistInput({
      displayName: 'DemoCare',
      emailDomain: 'democare.hospital',
    })
    assert.equal(v.domain, 'democare.hospital')
    assert.equal(v.contactEmail, 'verify@democare.hospital')
  })
})

describe('settle-highest helpers', () => {
  it('picks highest ELIGIBLE or APPROVED for settle_highest', () => {
    const top = pickHighestSettleCandidate([
      { percent: 25, status: MILESTONE_STATUS.SETTLED },
      { percent: 50, status: MILESTONE_STATUS.ELIGIBLE },
      { percent: 75, status: MILESTONE_STATUS.APPROVED },
      { percent: 100, status: MILESTONE_STATUS.LOCKED },
    ])
    assert.equal(top?.percent, 75)
    assert.equal(top?.status, MILESTONE_STATUS.APPROVED)
  })

  it('returns null when no settle candidate (expire path blocks)', () => {
    assert.equal(
      pickHighestSettleCandidate([
        { percent: 25, status: MILESTONE_STATUS.LOCKED },
        { percent: 50, status: MILESTONE_STATUS.SETTLED },
      ]),
      null
    )
  })
})

describe('document magic-byte sniff', () => {
  it('detects PDF / PNG / JPEG and rejects junk', () => {
    assert.equal(sniffDocumentBuffer(Buffer.from('%PDF-1.4')), 'pdf')
    assert.equal(
      sniffDocumentBuffer(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      ),
      'png'
    )
    assert.equal(
      sniffDocumentBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0])),
      'jpeg'
    )
    assert.equal(sniffDocumentBuffer(Buffer.from('not-a-file')), null)
    assert.equal(mimeMatchesSniff('application/pdf', 'pdf'), true)
    assert.equal(mimeMatchesSniff('image/png', 'pdf'), false)
  })
})

describe('admin secret compare', () => {
  it('accepts equal secrets and rejects mismatches', () => {
    assert.equal(secretsEqual('rdcf-demo-admin', 'rdcf-demo-admin'), true)
    assert.equal(secretsEqual('wrong', 'rdcf-demo-admin'), false)
    assert.equal(secretsEqual('', 'rdcf-demo-admin'), false)
  })
})
