/**
 * HMAC-signed hospital verify tokens.
 * Bound to caseId + recipient email; TTL ≤ 24h; single-use enforced in DB.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { AppError } from '../errors.js'
import { hashToken } from '../security/encryption.js'

export const MAGIC_LINK_PURPOSE = 'HOSPITAL_VERIFY' as const

export interface MagicLinkPayload {
  v: 1
  caseId: string
  email: string
  exp: number
  jti: string
}

export interface IssuedMagicLink {
  rawToken: string
  tokenHash: string
  expiresAt: Date
  payload: MagicLinkPayload
}

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function parseB64urlJson<T>(part: string): T {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T
}

function hmacSign(secret: string, payloadPart: string): string {
  return createHmac('sha256', secret).update(payloadPart, 'utf8').digest('base64url')
}

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Issue a signed token. ttlMs is capped at 24 hours.
 */
export function issueMagicLinkToken(opts: {
  secret: string
  caseId: string
  email: string
  ttlMs: number
  now?: Date
}): IssuedMagicLink {
  const now = opts.now ?? new Date()
  const cappedTtl = Math.min(Math.max(opts.ttlMs, 60_000), 24 * 60 * 60 * 1000)
  const expiresAt = new Date(now.getTime() + cappedTtl)
  const payload: MagicLinkPayload = {
    v: 1,
    caseId: opts.caseId,
    email: opts.email.trim().toLowerCase(),
    exp: Math.floor(expiresAt.getTime() / 1000),
    jti: randomBytes(16).toString('base64url'),
  }
  const payloadPart = b64urlJson(payload)
  const sig = hmacSign(opts.secret, payloadPart)
  const rawToken = `${payloadPart}.${sig}`
  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    expiresAt,
    payload,
  }
}

/**
 * Cryptographic verification only (HMAC + structure + exp).
 * Does not check single-use — that is DB-side.
 */
export function verifyMagicLinkToken(
  rawToken: string,
  secret: string,
  now: Date = new Date()
): MagicLinkPayload {
  const trimmed = rawToken.trim()
  const parts = trimmed.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new AppError(
      'MAGIC_LINK_INVALID',
      'This verification link is invalid.',
      400
    )
  }
  const [payloadPart, sig] = parts
  const expected = hmacSign(secret, payloadPart)
  if (!safeEqualString(sig, expected)) {
    throw new AppError(
      'MAGIC_LINK_INVALID',
      'This verification link is invalid or has been tampered with.',
      400
    )
  }

  let payload: MagicLinkPayload
  try {
    payload = parseB64urlJson<MagicLinkPayload>(payloadPart)
  } catch {
    throw new AppError(
      'MAGIC_LINK_INVALID',
      'This verification link is invalid.',
      400
    )
  }

  if (
    payload.v !== 1 ||
    typeof payload.caseId !== 'string' ||
    typeof payload.email !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.jti !== 'string'
  ) {
    throw new AppError(
      'MAGIC_LINK_INVALID',
      'This verification link is invalid.',
      400
    )
  }

  if (payload.exp * 1000 <= now.getTime()) {
    throw new AppError(
      'MAGIC_LINK_EXPIRED',
      'This verification link has expired. Ask the patient to resubmit or request a new link.',
      410
    )
  }

  return {
    v: 1,
    caseId: payload.caseId,
    email: payload.email.trim().toLowerCase(),
    exp: payload.exp,
    jti: payload.jti,
  }
}

export function buildVerifyUrl(appOrigin: string, rawToken: string): string {
  const origin = appOrigin.replace(/\/$/, '')
  return `${origin}/verify/${encodeURIComponent(rawToken)}`
}
