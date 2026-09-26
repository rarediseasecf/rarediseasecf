import { createHash, randomBytes } from 'node:crypto'

/** CSPRNG opaque ID (hex). Default 16 bytes → 32 hex chars. */
export function generateOpaqueId(byteLength = 16): string {
  return randomBytes(byteLength).toString('hex')
}

/** CSPRNG nonce as base64url (no padding). Default 16 bytes. */
export function generateNonce(byteLength = 16): string {
  return randomBytes(byteLength).toString('base64url')
}

/** Truncate a wallet address for safe development logs only. */
export function truncatePublicKey(publicKey: string): string {
  if (publicKey.length <= 10) return publicKey
  return `${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`
}

/** Lightweight request binding — hash of user-agent, never the raw string in stores beyond hash. */
export function hashUserAgent(userAgent: string | undefined): string {
  return createHash('sha256')
    .update(userAgent ?? '')
    .digest('hex')
    .slice(0, 16)
}
