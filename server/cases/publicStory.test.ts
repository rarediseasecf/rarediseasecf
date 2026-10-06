import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AppError } from '../errors.js'
import { activePublicStory, validatePublicStoryInput } from './publicStory.js'

const valid = {
  shareStory: 'true',
  consent: 'true',
  sharedBy: 'GUARDIAN',
  displayName: '  Aarav ',
  country: 'Nepal',
  condition: '',
  story: 'Aarav is seven and needs enzyme replacement therapy this year.',
}

function code(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (err) {
    return err instanceof AppError ? err.code : 'OTHER'
  }
  return undefined
}

describe('public patient story', () => {
  it('is off unless the submitter opts in', () => {
    assert.equal(validatePublicStoryInput({}), null)
    assert.equal(validatePublicStoryInput({ ...valid, shareStory: 'false' }), null)
  })

  it('requires explicit consent and a patient / guardian role', () => {
    assert.equal(code(() => validatePublicStoryInput({ ...valid, consent: undefined })), 'PUBLIC_STORY_CONSENT_REQUIRED')
    assert.equal(code(() => validatePublicStoryInput({ ...valid, sharedBy: 'FRIEND' })), 'INVALID_PUBLIC_STORY')
  })

  it('trims fields, drops empty optionals, and enforces lengths', () => {
    const story = validatePublicStoryInput(valid)
    assert.deepEqual(story, {
      displayName: 'Aarav',
      country: 'Nepal',
      condition: null,
      story: valid.story,
      sharedBy: 'GUARDIAN',
    })
    assert.equal(code(() => validatePublicStoryInput({ ...valid, story: 'too short' })), 'INVALID_PUBLIC_STORY')
    assert.equal(code(() => validatePublicStoryInput({ ...valid, displayName: 'x'.repeat(61) })), 'INVALID_PUBLIC_STORY')
  })

  it('is only public while consent is active', () => {
    const record = validatePublicStoryInput(valid)
    const consentAt = new Date('2026-10-01T00:00:00Z')
    assert.equal(
      activePublicStory({ publicStory: record, publicStoryConsentAt: consentAt, publicStoryWithdrawnAt: null })?.consentedAt,
      consentAt.toISOString()
    )
    assert.equal(activePublicStory({ publicStory: record, publicStoryConsentAt: null, publicStoryWithdrawnAt: null }), null)
    assert.equal(
      activePublicStory({ publicStory: record, publicStoryConsentAt: consentAt, publicStoryWithdrawnAt: new Date() }),
      null
    )
  })
})
