import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { AppError } from '../errors.js'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

export interface EncryptionKeyMaterial {
  key: Buffer
  keyId: string
}

export interface EncryptedPayload {
  ciphertext: string
  iv: string
  authTag: string
  keyId: string
}

export function parseEncryptionKey(
  base64Key: string | undefined,
  keyId: string | undefined
): EncryptionKeyMaterial {
  if (!base64Key || !base64Key.trim()) {
    throw new AppError(
      'ENCRYPTION_KEY_MISSING',
      'DATA_ENCRYPTION_KEY is required for case storage. Generate a local key and set it in .env.',
      500
    )
  }
  if (!keyId || !keyId.trim()) {
    throw new AppError(
      'ENCRYPTION_KEY_MISSING',
      'DATA_ENCRYPTION_KEY_ID is required for case storage.',
      500
    )
  }

  let key: Buffer
  try {
    key = Buffer.from(base64Key.trim(), 'base64')
  } catch {
    throw new AppError(
      'ENCRYPTION_KEY_INVALID',
      'DATA_ENCRYPTION_KEY must be valid base64.',
      500
    )
  }

  if (key.length !== 32) {
    throw new AppError(
      'ENCRYPTION_KEY_INVALID',
      'DATA_ENCRYPTION_KEY must decode to exactly 32 bytes (AES-256).',
      500
    )
  }

  return { key, keyId: keyId.trim() }
}

export function encryptJson(
  value: unknown,
  material: EncryptionKeyMaterial
): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, material.key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyId: material.keyId,
  }
}

export function decryptJson<T>(
  payload: {
    ciphertext: string
    iv: string
    authTag: string
  },
  material: EncryptionKeyMaterial
): T {
  try {
    const iv = Buffer.from(payload.iv, 'base64')
    const authTag = Buffer.from(payload.authTag, 'base64')
    const ciphertext = Buffer.from(payload.ciphertext, 'base64')
    const decipher = createDecipheriv(ALGORITHM, material.key, iv)
    decipher.setAuthTag(authTag)
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ])
    return JSON.parse(decrypted.toString('utf8')) as T
  } catch {
    throw new AppError(
      'DECRYPTION_FAILED',
      'Stored case details could not be read securely.',
      500
    )
  }
}

/** Encrypted file layout: MAGIC | iv(12) | authTag(16) | ciphertext */
const FILE_MAGIC = Buffer.from('RDCFENC1', 'ascii')
const AUTH_TAG_LENGTH = 16

export function encryptBuffer(
  plaintext: Buffer,
  material: EncryptionKeyMaterial
): Buffer {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, material.key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([FILE_MAGIC, iv, cipher.getAuthTag(), encrypted])
}

export function isEncryptedBuffer(data: Buffer): boolean {
  return (
    data.length >= FILE_MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH &&
    data.subarray(0, FILE_MAGIC.length).equals(FILE_MAGIC)
  )
}

export function decryptBuffer(
  data: Buffer,
  material: EncryptionKeyMaterial
): Buffer {
  if (!isEncryptedBuffer(data)) {
    throw new AppError(
      'DECRYPTION_FAILED',
      'Stored document could not be read securely.',
      500
    )
  }
  try {
    let offset = FILE_MAGIC.length
    const iv = data.subarray(offset, offset + IV_LENGTH)
    offset += IV_LENGTH
    const authTag = data.subarray(offset, offset + AUTH_TAG_LENGTH)
    offset += AUTH_TAG_LENGTH
    const decipher = createDecipheriv(ALGORITHM, material.key, iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(data.subarray(offset)), decipher.final()])
  } catch {
    throw new AppError(
      'DECRYPTION_FAILED',
      'Stored document could not be read securely.',
      500
    )
  }
}

export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

export function generateRawAccessToken(): string {
  return randomBytes(32).toString('base64url')
}

export function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex')
    const bufB = Buffer.from(b, 'hex')
    if (bufA.length !== bufB.length) return false
    return timingSafeEqual(bufA, bufB)
  } catch {
    return false
  }
}
