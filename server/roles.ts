/**
 * Day 1 role map — product roles for the hospital magic-link MVP.
 * Existing reviewer/provider wallet flows remain until later days replace them.
 */
export const APP_ROLES = {
  CREATOR: 'CREATOR',
  HOSPITAL_VERIFIER: 'HOSPITAL_VERIFIER',
  PLATFORM_ADMIN: 'PLATFORM_ADMIN',
  DONOR: 'DONOR',
  /** Legacy wallet reviewer (still in DB until Day 3+ migrates verify flow) */
  LEGACY_REVIEWER: 'REVIEWER',
} as const

export type AppRole = (typeof APP_ROLES)[keyof typeof APP_ROLES]
