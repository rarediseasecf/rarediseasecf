/**
 * Unit tests — HMAC magic-link tokens (no database).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AppError } from '../errors.js'
import {
  issueMagicLinkToken,
  verifyMagicLinkToken,
  buildVerifyUrl,
} from './magicLink.js'

const SECRET = 'test-magic-link-secret-day3'

describe('magic link HMAC tokens', () => {
  it('issues and verifies a token bound to caseId + email', () => {
    const issued = issueMagicLinkToken({
      secret: SECRET,
      caseId: 'case-uuid-1',
      email: 'verify@democare.hospital',
      ttlMs: 60 * 60 * 1000,
    })
    const payload = verifyMagicLinkToken(issued.rawToken, SECRET)
    assert.equal(payload.caseId, 'case-uuid-1')
    assert.equal(payload.email, 'verify@democare.hospital')
    assert.equal(issued.tokenHash.length, 64)
  })

  it('rejects tampered tokens', () => {
    const issued = issueMagicLinkToken({
      secret: SECRET,
      caseId: 'case-uuid-1',
      email: 'verify@democare.hospital',
      ttlMs: 60 * 60 * 1000,
    })
    const tampered = issued.rawToken.slice(0, -4) + 'xxxx'
    assert.throws(
      () => verifyMagicLinkToken(tampered, SECRET),
      (err: unknown) =>
        err instanceof AppError && err.code === 'MAGIC_LINK_INVALID'
    )
  })

  it('rejects expired tokens', () => {
    const issued = issueMagicLinkToken({
      secret: SECRET,
      caseId: 'case-uuid-1',
      email: 'verify@democare.hospital',
      ttlMs: 60_000,
      now: new Date(Date.now() - 120_000),
    })
    assert.throws(
      () => verifyMagicLinkToken(issued.rawToken, SECRET),
      (err: unknown) =>
        err instanceof AppError && err.code === 'MAGIC_LINK_EXPIRED'
    )
  })

  it('caps TTL at 24 hours', () => {
    const issued = issueMagicLinkToken({
      secret: SECRET,
      caseId: 'c',
      email: 'a@b.hospital',
      ttlMs: 48 * 60 * 60 * 1000,
      now: new Date('2026-01-01T00:00:00Z'),
    })
    const maxExp =
      Math.floor(new Date('2026-01-01T00:00:00Z').getTime() / 1000) +
      24 * 60 * 60
    assert.equal(issued.payload.exp, maxExp)
  })

  it('builds verify URL under app origin', () => {
    const url = buildVerifyUrl('http://localhost:5173', 'abc.def')
    assert.equal(url, 'http://localhost:5173/verify/abc.def')
  })
})
