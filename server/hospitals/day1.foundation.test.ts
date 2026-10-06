/**
 * Day 1 unit checks — case IDs + personal email blacklist.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generatePublicCaseId,
  isValidPublicCaseId,
} from '../utils/caseId.js'
import {
  emailDomain,
  isPersonalEmailDomain,
} from './emailPolicy.js'
import { DEFAULT_DEMO_HOSPITALS } from './bootstrap.js'

describe('Day 1 case IDs', () => {
  it('generates 5-letter opaque IDs', () => {
    const id = generatePublicCaseId()
    assert.match(id, /^[2-9A-HJ-NP-Z]{5}$/)
    assert.equal(isValidPublicCaseId(id), true)
  })

  it('still accepts legacy RD-* IDs', () => {
    assert.equal(isValidPublicCaseId('RD-8F29KQ'), true)
  })
})

describe('Day 1 email policy', () => {
  it('rejects personal domains', () => {
    assert.equal(isPersonalEmailDomain('gmail.com'), true)
    assert.equal(isPersonalEmailDomain('outlook.com'), true)
  })

  it('allows institutional-looking domains', () => {
    assert.equal(isPersonalEmailDomain('democare.hospital'), false)
    assert.equal(emailDomain('verify@democare.hospital'), 'democare.hospital')
  })

  it('seeds one demo hospital with a non-personal domain', () => {
    assert.equal(DEFAULT_DEMO_HOSPITALS.length, 1)
    for (const h of DEFAULT_DEMO_HOSPITALS) {
      assert.equal(isPersonalEmailDomain(h.emailDomain), false)
      assert.ok(h.contactEmail.endsWith(`@${h.emailDomain}`))
    }
  })
})
