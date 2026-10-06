/**
 * Opt-in public patient story.
 *
 * Health information is only published with the explicit, informed, revocable
 * consent of the patient or their legal guardian (HIPAA authorization, GDPR
 * Art. 9(2)(a) explicit consent, and equivalent national rules). The consent
 * time and text version are recorded, and the story stops being served the
 * moment consent is withdrawn.
 */
import { AppError } from '../errors.js'
import type { CaseRow, PublicPatientStoryRecord } from '../db/schema.js'

export const PUBLIC_STORY_CONSENT_VERSION = 'patient-story-v1'

export const PUBLIC_STORY_LIMITS = {
  displayName: 60,
  country: 60,
  condition: 120,
  storyMin: 20,
  story: 2000,
} as const

export interface PublicStoryInput {
  shareStory?: unknown
  consent?: unknown
  sharedBy?: unknown
  displayName?: unknown
  country?: unknown
  condition?: unknown
  story?: unknown
}

export interface PublicPatientStoryView extends PublicPatientStoryRecord {
  consentedAt: string
}

function isTrue(value: unknown): boolean {
  return value === true || value === 'true' || value === '1' || value === 'on'
}

/* eslint-disable-next-line no-control-regex */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

function cleanText(value: unknown, field: string, max: number, required: boolean): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new AppError('INVALID_PUBLIC_STORY', `${field} is required to share a public story.`, 400)
    }
    return null
  }
  if (typeof value !== 'string') {
    throw new AppError('INVALID_PUBLIC_STORY', `${field} must be text.`, 400)
  }
  const trimmed = value.replace(CONTROL_CHARS, '').trim()
  if (!trimmed) {
    if (required) {
      throw new AppError('INVALID_PUBLIC_STORY', `${field} is required to share a public story.`, 400)
    }
    return null
  }
  if (trimmed.length > max) {
    throw new AppError('INVALID_PUBLIC_STORY', `${field} is too long (max ${max} characters).`, 400)
  }
  return trimmed
}

/** Returns null when the submitter did not opt in. Opting in without consent is rejected. */
export function validatePublicStoryInput(input: PublicStoryInput): PublicPatientStoryRecord | null {
  if (!isTrue(input.shareStory)) return null

  if (!isTrue(input.consent)) {
    throw new AppError(
      'PUBLIC_STORY_CONSENT_REQUIRED',
      'Tick the consent box to share your story publicly, or turn sharing off.',
      400
    )
  }
  if (input.sharedBy !== 'PATIENT' && input.sharedBy !== 'GUARDIAN') {
    throw new AppError(
      'INVALID_PUBLIC_STORY',
      'Confirm whether you are the patient or their parent / legal guardian.',
      400
    )
  }

  const story = cleanText(input.story, 'Your story', PUBLIC_STORY_LIMITS.story, true) as string
  if (story.length < PUBLIC_STORY_LIMITS.storyMin) {
    throw new AppError(
      'INVALID_PUBLIC_STORY',
      `Your story should be at least ${PUBLIC_STORY_LIMITS.storyMin} characters.`,
      400
    )
  }

  return {
    displayName: cleanText(input.displayName, 'Name to show', PUBLIC_STORY_LIMITS.displayName, true) as string,
    country: cleanText(input.country, 'Country', PUBLIC_STORY_LIMITS.country, false),
    condition: cleanText(input.condition, 'Condition', PUBLIC_STORY_LIMITS.condition, false),
    story,
    sharedBy: input.sharedBy,
  }
}

/** The story as it may be shown publicly, or null if never consented or withdrawn. */
export function activePublicStory(
  row: Pick<CaseRow, 'publicStory' | 'publicStoryConsentAt' | 'publicStoryWithdrawnAt'>
): PublicPatientStoryView | null {
  if (!row.publicStory || !row.publicStoryConsentAt || row.publicStoryWithdrawnAt) {
    return null
  }
  return { ...row.publicStory, consentedAt: row.publicStoryConsentAt.toISOString() }
}
