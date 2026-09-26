import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { PublicKey } from '@solana/web3.js'
import type { ServerConfig } from '../config.js'
import {
  generateNonce,
  generateOpaqueId,
  hashUserAgent,
  truncatePublicKey,
} from '../utils/crypto.js'
import { buildWalletVerificationMessage } from './message.js'
import type { ChallengeStore } from './challengeStore.js'
import type { SessionStore } from './sessionStore.js'
import {
  AuthError,
  type ChallengeRecord,
  type ChallengeResponse,
  type SessionAuthenticatedResponse,
  type SessionRecord,
  type SessionResponse,
} from './types.js'

/** Max failed signature checks before a challenge is invalidated. Documented policy. */
export const MAX_FAILED_VERIFY_ATTEMPTS = 3

export interface IssueChallengeInput {
  publicKey: string
  origin: string
  userAgent: string | undefined
}

export interface VerifyChallengeInput {
  challengeId: string
  publicKey: string
  signature: string
  origin: string
}

export interface VerifyChallengeResult {
  session: SessionRecord
  response: SessionAuthenticatedResponse
}

function assertValidSolanaPublicKey(publicKey: string): void {
  try {
    const key = new PublicKey(publicKey)
    // Reject on-curve check failures and wrong lengths via constructor + encode round-trip
    if (key.toBase58() !== publicKey) {
      throw new Error('normalized mismatch')
    }
  } catch {
    throw new AuthError(
      'INVALID_PUBLIC_KEY',
      'A valid wallet address is required.',
      400
    )
  }
}

function decodeSignature(signature: string): Uint8Array {
  try {
    const bytes = bs58.decode(signature)
    if (bytes.length !== 64) {
      throw new Error('bad length')
    }
    return bytes
  } catch {
    throw new AuthError(
      'INVALID_SIGNATURE',
      'We could not confirm this wallet.',
      401
    )
  }
}

function decodePublicKeyBytes(publicKey: string): Uint8Array {
  try {
    const key = new PublicKey(publicKey)
    return key.toBytes()
  } catch {
    throw new AuthError(
      'INVALID_PUBLIC_KEY',
      'A valid wallet address is required.',
      400
    )
  }
}

export class AuthService {
  constructor(
    private readonly config: ServerConfig,
    private readonly challenges: ChallengeStore,
    private readonly sessions: SessionStore
  ) {}

  issueChallenge(input: IssueChallengeInput): ChallengeResponse {
    assertValidSolanaPublicKey(input.publicKey)

    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.config.challengeTtlMs)
    const challengeId = generateOpaqueId(16)
    const nonce = generateNonce(16)
    const message = buildWalletVerificationMessage({
      publicKey: input.publicKey,
      nonce,
      appOriginHost: this.config.appOriginHost,
      network: this.config.networkLabel,
      issuedAt: now,
      expiresAt,
    })

    const record: ChallengeRecord = {
      challengeId,
      nonce,
      publicKey: input.publicKey,
      message,
      issuedAt: now,
      expiresAt,
      consumedAt: null,
      expectedOrigin: this.config.appOrigin,
      userAgentHash: hashUserAgent(input.userAgent),
      createdAt: now,
      failedAttempts: 0,
    }

    this.challenges.set(record)

    console.info(
      JSON.stringify({
        event: 'challenge_issued',
        challengeIdPrefix: challengeId.slice(0, 8),
        wallet: truncatePublicKey(input.publicKey),
        expiresAt: expiresAt.toISOString(),
      })
    )

    return {
      challengeId,
      message,
      expiresAt: expiresAt.toISOString(),
    }
  }

  verifyChallenge(input: VerifyChallengeInput): VerifyChallengeResult {
    if (
      typeof input.challengeId !== 'string' ||
      !input.challengeId ||
      typeof input.signature !== 'string' ||
      !input.signature
    ) {
      throw new AuthError(
        'INVALID_REQUEST',
        'A valid confirmation request is required.',
        400
      )
    }

    assertValidSolanaPublicKey(input.publicKey)

    const challenge = this.challenges.get(input.challengeId)
    if (!challenge) {
      throw new AuthError(
        'CHALLENGE_NOT_FOUND',
        'We could not prepare account confirmation.',
        404
      )
    }

    const now = new Date()

    if (challenge.consumedAt !== null) {
      throw new AuthError(
        'CHALLENGE_ALREADY_USED',
        'We could not confirm this wallet.',
        401
      )
    }

    if (challenge.expiresAt <= now) {
      this.challenges.delete(challenge.challengeId)
      throw new AuthError(
        'CHALLENGE_EXPIRED',
        'For your security, please request a new confirmation message.',
        401
      )
    }

    if (challenge.publicKey !== input.publicKey) {
      throw new AuthError(
        'WALLET_MISMATCH',
        'Please restart account confirmation with the currently connected wallet.',
        401
      )
    }

    // Verify against the exact stored message — never a client-authored string.
    const messageBytes = new TextEncoder().encode(challenge.message)
    const publicKeyBytes = decodePublicKeyBytes(input.publicKey)
    const signatureBytes = decodeSignature(input.signature)

    const valid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    )

    if (!valid) {
      challenge.failedAttempts += 1
      const invalidate =
        challenge.failedAttempts >= MAX_FAILED_VERIFY_ATTEMPTS

      if (invalidate) {
        challenge.consumedAt = now
        this.challenges.delete(challenge.challengeId)
      } else {
        this.challenges.set(challenge)
      }

      console.info(
        JSON.stringify({
          event: 'challenge_verify_failed',
          reason: 'invalid_signature',
          challengeIdPrefix: challenge.challengeId.slice(0, 8),
          wallet: truncatePublicKey(input.publicKey),
          invalidated: invalidate,
        })
      )

      throw new AuthError(
        'INVALID_SIGNATURE',
        'We could not confirm this wallet.',
        401
      )
    }

    // Consume immediately on success — single-use nonce.
    challenge.consumedAt = now
    this.challenges.delete(challenge.challengeId)

    const sessionId = generateOpaqueId(24)
    const expiresAt = new Date(now.getTime() + this.config.sessionTtlMs)
    const session: SessionRecord = {
      sessionId,
      publicKey: input.publicKey,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
    }
    this.sessions.set(session)

    console.info(
      JSON.stringify({
        event: 'challenge_verify_success',
        challengeIdPrefix: challenge.challengeId.slice(0, 8),
        wallet: truncatePublicKey(input.publicKey),
        expiresAt: expiresAt.toISOString(),
      })
    )

    return {
      session,
      response: {
        authenticated: true,
        walletAddress: input.publicKey,
        expiresAt: expiresAt.toISOString(),
      },
    }
  }

  getSession(sessionId: string | undefined): SessionResponse {
    if (!sessionId) {
      return { authenticated: false }
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      return { authenticated: false }
    }

    const now = new Date()
    if (session.expiresAt <= now) {
      this.sessions.delete(sessionId)
      return { authenticated: false }
    }

    session.lastSeenAt = now
    this.sessions.set(session)

    return {
      authenticated: true,
      walletAddress: session.publicKey,
      expiresAt: session.expiresAt.toISOString(),
    }
  }

  logout(sessionId: string | undefined): void {
    if (sessionId) {
      this.sessions.delete(sessionId)
    }
    console.info(JSON.stringify({ event: 'logout' }))
  }

  cleanupExpired(): { challenges: number; sessions: number } {
    const challenges = this.challenges.cleanupExpired()
    const sessions = this.sessions.cleanupExpired()
    if (challenges > 0 || sessions > 0) {
      console.info(
        JSON.stringify({
          event: 'store_cleanup',
          challengesRemoved: challenges,
          sessionsRemoved: sessions,
        })
      )
    }
    return { challenges, sessions }
  }
}
