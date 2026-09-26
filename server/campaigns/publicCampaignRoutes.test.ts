/**
 * Public campaign route helpers — pagination + ID validation (unit).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CAMPAIGN_PUBLICATION_STATUS } from './publicCampaignSerializer.js'
import { isValidPublicCaseId } from '../utils/caseId.js'

describe('publication status model', () => {
  it('supports APPROVED_NOT_PUBLISHED and PUBLISHED only for Day 6 workflows', () => {
    assert.equal(
      CAMPAIGN_PUBLICATION_STATUS.APPROVED_NOT_PUBLISHED,
      'APPROVED_NOT_PUBLISHED'
    )
    assert.equal(CAMPAIGN_PUBLICATION_STATUS.PUBLISHED, 'PUBLISHED')
  })
})

describe('public campaign ID pattern', () => {
  it('accepts legacy RD-* and new 5-letter opaque IDs', () => {
    assert.equal(isValidPublicCaseId('RD-8F29KQ'), true)
    assert.equal(isValidPublicCaseId('rd-ABCDEF'), true)
    assert.equal(isValidPublicCaseId('K7MQP'), true)
  })

  it('rejects UUID and private case guessing shapes', () => {
    assert.equal(isValidPublicCaseId('11111111-1111-1111-1111-111111111111'), false)
    assert.equal(isValidPublicCaseId('../cases/secret'), false)
    assert.equal(isValidPublicCaseId(''), false)
  })
})

describe('public list pagination bounds', () => {
  function clampPagination(input: { page?: number; pageSize?: number }) {
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.min(24, Math.max(1, input.pageSize ?? 12))
    return { page, pageSize }
  }

  it('defaults to page 1 and pageSize 12', () => {
    assert.deepEqual(clampPagination({}), { page: 1, pageSize: 12 })
  })

  it('caps pageSize at 24', () => {
    assert.deepEqual(clampPagination({ page: 2, pageSize: 100 }), {
      page: 2,
      pageSize: 24,
    })
  })

  it('floors invalid page to 1', () => {
    assert.deepEqual(clampPagination({ page: 0, pageSize: 0 }), {
      page: 1,
      pageSize: 1,
    })
  })
})
