/**
 * Opaque public-safe case / campaign reference.
 *
 * New format (Day 1+): 5-character uppercase ID, e.g. K7MQP
 * Legacy format still accepted for existing rows: RD-XXXXXX
 *
 * CSPRNG only — never derived from identity or medical content.
 */
import { randomBytes } from 'node:crypto'

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // no 0/O/1/I

/** New IDs: exactly 5 chars from the opaque alphabet. */
export const PUBLIC_CASE_ID_NEW = /^[2-9A-HJ-NP-Z]{5}$/

/** Legacy IDs still readable so old demo campaigns keep loading. */
export const PUBLIC_CASE_ID_LEGACY = /^RD-[2-9A-HJ-NP-Z]{6,8}$/i

export const PUBLIC_CASE_ID_PATTERN =
  /^(?:RD-[2-9A-HJ-NP-Z]{6,8}|[2-9A-HJ-NP-Z]{5})$/i

/** Always returns a new 5-letter opaque ID. */
export function generatePublicCaseId(): string {
  const bytes = randomBytes(5)
  let body = ''
  for (let i = 0; i < 5; i++) {
    body += ALPHABET[bytes[i]! % ALPHABET.length]
  }
  return body
}

export function isValidPublicCaseId(value: string): boolean {
  return PUBLIC_CASE_ID_PATTERN.test(value.trim())
}

export function normalizePublicCaseId(value: string): string {
  return value.trim().toUpperCase()
}
