import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { PublicKey } from '@solana/web3.js'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { ServerConfig } from '../config.js'
import type { Database } from '../db/index.js'
import {
  reviewerRegistry,
  reviewerSessions,
  type ReviewerRegistryRow,
} from '../db/schema.js'
import { ChallengeStore } from '../auth/challengeStore.js'
import {
  generateNonce,
  generateOpaqueId,
  hashUserAgent,
  truncatePublicKey,
} from '../utils/crypto.js'
import {
  generateRawAccessToken,
  hashToken,
} from '../security/encryption.js'
import { AppError } from '../errors.js'
import { buildReviewerVerificationMessage } from './reviewerMessage.js'
import type {
  ReviewerSessionResponse,
  ReviewerUnauthenticatedResponse,
} from './types.js'

const MAX_FAILED_VERIFY_ATTEMPTS = 3

export class ReviewerAuthService {
  constructor(
    private readonly db: Database['db'],
    private readonly config: ServerConfig,
    private readonly challenges: ChallengeStore
  ) {}

  async issueChallenge(publicKey: string, userAgent: string | undefined) {
    this.assertValidPublicKey(publicKey)

    const now = new Date()
    const expiresAt = new Date(now.getTime() + this.config.challengeTtlMs)
    const challengeId = generateOpaqueId(16)
    const nonce = generateNonce(16)
    const message = buildReviewerVerificationMessage({
      publicKey,
      nonce,
      appOriginHost: this.config.appOriginHost,
      network: this.config.networkLabel,
      issuedAt: now,
      expiresAt,
    })

    this.challenges.set({
      challengeId,
      nonce,
      publicKey,
      message,
      issuedAt: now,
      expiresAt,
      consumedAt: null,
      expectedOrigin: this.config.appOrigin,
      userAgentHash: hashUserAgent(userAgent),
      createdAt: now,
      failedAttempts: 0,
    })

    console.info(
      JSON.stringify({
        event: 'reviewer_challenge_issued',
        challengeIdPrefix: challengeId.slice(0, 8),
        wallet: truncatePublicKey(publicKey),
      })
    )

    return {
      challengeId,
      message,
      expiresAt: expiresAt.toISOString(),
    }
  }

  async verifyAndCreateSession(input: {
    challengeId: string
    publicKey: string
    signature: string
  }): Promise<{
    rawToken: string
    response: ReviewerSessionResponse
  }> {
    this.assertValidPublicKey(input.publicKey)

    const challenge = this.challenges.get(input.challengeId)
    if (!challenge) {
      throw new AppError(
        'CHALLENGE_NOT_FOUND',
        'We could not prepare reviewer confirmation.',
        404
      )
    }

    const now = new Date()
    if (challenge.consumedAt !== null) {
      throw new AppError(
        'CHALLENGE_ALREADY_USED',
        'We could not confirm this wallet.',
        401
      )
    }
    if (challenge.expiresAt <= now) {
      this.challenges.delete(challenge.challengeId)
      throw new AppError(
        'CHALLENGE_EXPIRED',
        'For your security, please request a new confirmation message.',
        401
      )
    }
    if (challenge.publicKey !== input.publicKey) {
      throw new AppError(
        'WALLET_MISMATCH',
        'Please restart account confirmation with the currently connected wallet.',
        401
      )
    }

    const messageBytes = new TextEncoder().encode(challenge.message)
    const publicKeyBytes = new PublicKey(input.publicKey).toBytes()
    let signatureBytes: Uint8Array
    try {
      signatureBytes = bs58.decode(input.signature)
      if (signatureBytes.length !== 64) throw new Error('bad length')
    } catch {
      throw new AppError(
        'INVALID_SIGNATURE',
        'We could not confirm this wallet.',
        401
      )
    }

    const valid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    )

    if (!valid) {
      challenge.failedAttempts += 1
      if (challenge.failedAttempts >= MAX_FAILED_VERIFY_ATTEMPTS) {
        this.challenges.delete(challenge.challengeId)
      } else {
        this.challenges.set(challenge)
      }
      throw new AppError(
        'INVALID_SIGNATURE',
        'We could not confirm this wallet.',
        401
      )
    }

    this.challenges.delete(challenge.challengeId)

    const reviewer = await this.findActiveReviewer(input.publicKey)
    if (!reviewer) {
      console.info(
        JSON.stringify({
          event: 'reviewer_access_denied',
          wallet: truncatePublicKey(input.publicKey),
        })
      )
      throw new AppError(
        'REVIEWER_ACCESS_DENIED',
        'This account does not have reviewer access.',
        403
      )
    }

    const rawToken = generateRawAccessToken()
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(now.getTime() + this.config.reviewerSessionTtlMs)

    await this.db.insert(reviewerSessions).values({
      reviewerId: reviewer.id,
      tokenHash,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
      revokedAt: null,
    })

    console.info(
      JSON.stringify({
        event: 'reviewer_access_granted',
        wallet: truncatePublicKey(input.publicKey),
        reviewerIdPrefix: reviewer.id.slice(0, 8),
      })
    )

    return {
      rawToken,
      response: {
        authenticated: true,
        role: 'REVIEWER',
        walletAddress: input.publicKey,
        expiresAt: expiresAt.toISOString(),
      },
    }
  }

  async getSession(
    rawToken: string | undefined
  ): Promise<ReviewerSessionResponse | ReviewerUnauthenticatedResponse> {
    const resolved = await this.resolveSession(rawToken)
    if (!resolved) return { authenticated: false }
    return {
      authenticated: true,
      role: 'REVIEWER',
      walletAddress: resolved.reviewer.walletAddress,
      expiresAt: resolved.session.expiresAt.toISOString(),
    }
  }

  async resolveSession(rawToken: string | undefined): Promise<{
    reviewer: ReviewerRegistryRow
    session: { id: string; expiresAt: Date }
  } | null> {
    if (!rawToken) return null
    const tokenHash = hashToken(rawToken)
    const now = new Date()

    const rows = await this.db
      .select({
        session: reviewerSessions,
        reviewer: reviewerRegistry,
      })
      .from(reviewerSessions)
      .innerJoin(
        reviewerRegistry,
        eq(reviewerSessions.reviewerId, reviewerRegistry.id)
      )
      .where(
        and(
          eq(reviewerSessions.tokenHash, tokenHash),
          isNull(reviewerSessions.revokedAt),
          gt(reviewerSessions.expiresAt, now),
          eq(reviewerRegistry.isActive, true)
        )
      )
      .limit(1)

    const hit = rows[0]
    if (!hit) return null

    await this.db
      .update(reviewerSessions)
      .set({ lastSeenAt: now })
      .where(eq(reviewerSessions.id, hit.session.id))

    return {
      reviewer: hit.reviewer,
      session: { id: hit.session.id, expiresAt: hit.session.expiresAt },
    }
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return
    const tokenHash = hashToken(rawToken)
    const now = new Date()
    await this.db
      .update(reviewerSessions)
      .set({ revokedAt: now })
      .where(eq(reviewerSessions.tokenHash, tokenHash))
    console.info(JSON.stringify({ event: 'reviewer_logout' }))
  }

  private async findActiveReviewer(
    walletAddress: string
  ): Promise<ReviewerRegistryRow | undefined> {
    const rows = await this.db
      .select()
      .from(reviewerRegistry)
      .where(
        and(
          eq(reviewerRegistry.walletAddress, walletAddress),
          eq(reviewerRegistry.isActive, true),
          eq(reviewerRegistry.role, 'REVIEWER')
        )
      )
      .limit(1)
    return rows[0]
  }

  private assertValidPublicKey(publicKey: string): void {
    try {
      const key = new PublicKey(publicKey)
      if (key.toBase58() !== publicKey) throw new Error('mismatch')
    } catch {
      throw new AppError(
        'INVALID_PUBLIC_KEY',
        'A valid wallet address is required.',
        400
      )
    }
  }
}
