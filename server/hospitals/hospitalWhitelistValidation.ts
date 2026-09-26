/**
 * Pure hospital whitelist input validation (unit-testable).
 */
import { AppError } from '../errors.js'
import {
  emailDomain,
  isPersonalEmailDomain,
  normalizeInstitutionalEmail,
} from './emailPolicy.js'

export function validateHospitalWhitelistInput(input: {
  displayName?: string
  emailDomain?: string
  contactEmail?: string
}): {
  displayName: string
  domain: string
  contactEmail: string
} {
  const displayName =
    typeof input.displayName === 'string' ? input.displayName.trim() : ''
  if (!displayName || displayName.length > 200) {
    throw new AppError(
      'INVALID_HOSPITAL',
      'Display name is required (max 200 characters).',
      400
    )
  }

  let domain =
    typeof input.emailDomain === 'string'
      ? input.emailDomain.trim().toLowerCase()
      : ''
  let contactEmail: string | null = null

  if (typeof input.contactEmail === 'string' && input.contactEmail.trim()) {
    const normalized = normalizeInstitutionalEmail(input.contactEmail)
    if ('error' in normalized) {
      throw new AppError('INVALID_HOSPITAL_EMAIL', normalized.error, 400)
    }
    contactEmail = normalized.email
    if (!domain) domain = normalized.domain
  }

  if (!domain) {
    throw new AppError(
      'INVALID_HOSPITAL',
      'Provide an email domain and/or a full institutional contact email.',
      400
    )
  }

  if (isPersonalEmailDomain(domain)) {
    throw new AppError(
      'INVALID_HOSPITAL_EMAIL',
      'Personal email domains cannot be whitelisted.',
      400
    )
  }

  if (!contactEmail) {
    contactEmail = `verify@${domain}`
  } else {
    const contactDomain = emailDomain(contactEmail)
    if (contactDomain !== domain) {
      throw new AppError(
        'INVALID_HOSPITAL',
        'Contact email domain must match the whitelist domain.',
        400
      )
    }
  }

  return { displayName, domain, contactEmail }
}
