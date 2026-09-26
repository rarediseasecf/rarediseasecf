/**
 * Auth service unit tests — Node built-in test runner.
 * Covers challenge issuance, Ed25519 verification, session cookie lifecycle.
 *
 * Failed-signature policy: up to MAX_FAILED_VERIFY_ATTEMPTS attempts are
 * allowed; the challenge is then invalidated. Documented in README.
 */
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { Keypair } from '@solana/web3.js'
import { loadConfig } from '../config.js'
import { ChallengeStore } from './challengeStore.js'
import { SessionStore } from './sessionStore.js'
import { AuthService, MAX_FAILED_VERIFY_ATTEMPTS } from './authService.js'
import { AuthError } from './types.js'

const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64')

function createService(overrides: Record<string, string> = {}) {
  const config = loadConfig({
    APP_ORIGIN: 'http://localhost:5173',
    SESSION_TTL_HOURS: '24',
    CHALLENGE_TTL_MINUTES: '5',
    DATABASE_URL: 'postgresql://rdcf_dev:rdcf_dev_password@localhost:5432/rarediseasecf_dev',
    DATA_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
    DATA_ENCRYPTION_KEY_ID: 'test-v1',
    REVIEWER_BOOTSTRAP_WALLETS: '',
    PROVIDER_BOOTSTRAP_RECORDS: '[]',
    USDC_MINT: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    PLATFORM_AUTHORITY_SECRET_KEY: 'test-only-not-parsed-by-loadConfig',
    ...overrides,
  })
  const challenges = new ChallengeStore()
  const sessions = new SessionStore()
  const authService = new AuthService(config, challenges, sessions)
  return { config, challenges, sessions, authService }
}

function signMessage(keypair: Keypair, message: string): string {
  const sig = nacl.sign.detached(
    new TextEncoder().encode(message),
    keypair.secretKey
  )
  return bs58.encode(sig)
}

describe('AuthService', () => {
  let keypair: Keypair

  beforeEach(() => {
    keypair = Keypair.generate()
  })

  it('valid signature for correct public key and challenge succeeds', () => {
    const { authService } = createService()
    const publicKey = keypair.publicKey.toBase58()
    const challenge = authService.issueChallenge({
      publicKey,
      origin: 'http://localhost:5173',
      userAgent: 'test',
    })

    const signature = signMessage(keypair, challenge.message)
    const result = authService.verifyChallenge({
      challengeId: challenge.challengeId,
      publicKey,
      signature,
      origin: 'http://localhost:5173',
    })

    assert.equal(result.response.authenticated, true)
    assert.equal(result.response.walletAddress, publicKey)
    assert.ok(result.session.sessionId.length >= 32)
  })

  it('invalid signature fails', () => {
    const { authService } = createService()
    const publicKey = keypair.publicKey.toBase58()
    const challenge = authService.issueChallenge({
      publicKey,
      origin: 'http://localhost:5173',
      userAgent: 'test',
    })

    const badSig = bs58.encode(Buffer.alloc(64, 1))

    assert.throws(
      () =>
        authService.verifyChallenge({
          challengeId: challenge.challengeId,
          publicKey,
          signature: badSig,
          origin: 'http://localhost:5173',
        }),
      (err: unknown) =>
        err instanceof AuthError && err.code === 'INVALID_SIGNATURE'
    )
  })

  it('signature from another public key fails', () => {
    const { authService } = createService()
    const publicKey = keypair.publicKey.toBase58()
    const other = Keypair.generate()
    const challenge = authService.issueChallenge({
      publicKey,
      origin: 'http://localhost:5173',
      userAgent: 'test',
    })

    const signature = signMessage(other, challenge.message)

    assert.throws(
      () =>
        authService.verifyChallenge({
          challengeId: challenge.challengeId,
          publicKey,
          signature,
          origin: 'http://localhost:5173',
        }),
      (err: unknown) =>
        err instanceof AuthError && err.code === 'INVALID_SIGNATURE'
    )
  })

  it('expired challenge fails', () => {
    const { authService, challenges } = createService({
      CHALLENGE_TTL_MINUTES: '5',
    })
    const publicKey = keypair.publicKey.toBase58()
    const challenge = authService.issueChallenge({
      publicKey,
      origin: 'http://localhost:5173',
      userAgent: 'test',
    })

    const record = challenges.get(challenge.challengeId)!
    record.expiresAt = new Date(Date.now() - 1000)
    challenges.set(record)

    const signature = signMessage(keypair, challenge.message)

    assert.throws(
      () =>
        authService.verifyChallenge({
          challengeId: challenge.challengeId,
          publicKey,
          signature,
          origin: 'http://localhost:5173',
        }),
      (err: unknown) =>
        err instanceof AuthError && err.code === 'CHALLENGE_EXPIRED'
    )
  })

  it('reused successful challenge fails', () => {
    const { authService } = createService()
    const publicKey = keypair.publicKey.toBase58()
    const challenge = authService.issueChallenge({
      publicKey,
      origin: 'http://localhost:5173',
      userAgent: 'test',
    })
    const signature = signMessage(keypair, challenge.message)

    authService.verifyChallenge({
      challengeId: challenge.challengeId,
      publicKey,
      signature,
      origin: 'http://localhost:5173',
    })

    assert.throws(
      () =>
        authService.verifyChallenge({
          challengeId: challenge.challengeId,
          publicKey,
          signature,
          origin: 'http://localhost:5173',
        }),
      (err: unknown) =>
        err instanceof AuthError && err.code === 'CHALLENGE_NOT_FOUND'
    )
  })

  it('unknown challenge ID fails', () => {
    const { authService } = createService()
    const publicKey = keypair.publicKey.toBase58()

    assert.throws(
      () =>
        authService.verifyChallenge({
          challengeId: 'does-not-exist',
          publicKey,
          signature: bs58.encode(Buffer.alloc(64, 2)),
          origin: 'http://localhost:5173',
        }),
      (err: unknown) =>
        err instanceof AuthError && err.code === 'CHALLENGE_NOT_FOUND'
    )
  })

  it('modified wallet public key fails', () => {
    const { authService } = createService()
    const publicKey = keypair.publicKey.toBase58()
    const other = Keypair.generate().publicKey.toBase58()
    const challenge = authService.issueChallenge({
      publicKey,
      origin: 'http://localhost:5173',
      userAgent: 'test',
    })
    const signature = signMessage(keypair, challenge.message)

    assert.throws(
      () =>
        authService.verifyChallenge({
          challengeId: challenge.challengeId,
          publicKey: other,
          signature,
          origin: 'http://localhost:5173',
        }),
      (err: unknown) =>
        err instanceof AuthError && err.code === 'WALLET_MISMATCH'
    )
  })

  it('modified message signature fails', () => {
    const { authService } = createService()
    const publicKey = keypair.publicKey.toBase58()
    const challenge = authService.issueChallenge({
      publicKey,
      origin: 'http://localhost:5173',
      userAgent: 'test',
    })
    const signature = signMessage(keypair, challenge.message + '\nTAMPERED')

    assert.throws(
      () =>
        authService.verifyChallenge({
          challengeId: challenge.challengeId,
          publicKey,
          signature,
          origin: 'http://localhost:5173',
        }),
      (err: unknown) =>
        err instanceof AuthError && err.code === 'INVALID_SIGNATURE'
    )
  })

  it('session returns unauthenticated with no cookie', () => {
    const { authService } = createService()
    assert.deepEqual(authService.getSession(undefined), {
      authenticated: false,
    })
  })

  it('successful verify creates a session readable by getSession', () => {
    const { authService } = createService()
    const publicKey = keypair.publicKey.toBase58()
    const challenge = authService.issueChallenge({
      publicKey,
      origin: 'http://localhost:5173',
      userAgent: 'test',
    })
    const signature = signMessage(keypair, challenge.message)
    const { session } = authService.verifyChallenge({
      challengeId: challenge.challengeId,
      publicKey,
      signature,
      origin: 'http://localhost:5173',
    })

    const result = authService.getSession(session.sessionId)
    assert.equal(result.authenticated, true)
    if (result.authenticated) {
      assert.equal(result.walletAddress, publicKey)
    }
  })

  it('logout clears active session', () => {
    const { authService } = createService()
    const publicKey = keypair.publicKey.toBase58()
    const challenge = authService.issueChallenge({
      publicKey,
      origin: 'http://localhost:5173',
      userAgent: 'test',
    })
    const signature = signMessage(keypair, challenge.message)
    const { session } = authService.verifyChallenge({
      challengeId: challenge.challengeId,
      publicKey,
      signature,
      origin: 'http://localhost:5173',
    })

    authService.logout(session.sessionId)
    assert.deepEqual(authService.getSession(session.sessionId), {
      authenticated: false,
    })
  })

  it('expired session returns authenticated false', () => {
    const { authService, sessions } = createService()
    const publicKey = keypair.publicKey.toBase58()
    const challenge = authService.issueChallenge({
      publicKey,
      origin: 'http://localhost:5173',
      userAgent: 'test',
    })
    const signature = signMessage(keypair, challenge.message)
    const { session } = authService.verifyChallenge({
      challengeId: challenge.challengeId,
      publicKey,
      signature,
      origin: 'http://localhost:5173',
    })

    session.expiresAt = new Date(Date.now() - 1000)
    sessions.set(session)

    assert.deepEqual(authService.getSession(session.sessionId), {
      authenticated: false,
    })
  })

  it('invalid public key is rejected on challenge', () => {
    const { authService } = createService()
    assert.throws(
      () =>
        authService.issueChallenge({
          publicKey: 'not-a-wallet',
          origin: 'http://localhost:5173',
          userAgent: 'test',
        }),
      (err: unknown) =>
        err instanceof AuthError && err.code === 'INVALID_PUBLIC_KEY'
    )
  })

  it('too many failed attempts invalidates the challenge', () => {
    const { authService } = createService()
    const publicKey = keypair.publicKey.toBase58()
    const challenge = authService.issueChallenge({
      publicKey,
      origin: 'http://localhost:5173',
      userAgent: 'test',
    })
    const badSig = bs58.encode(Buffer.alloc(64, 7))

    for (let i = 0; i < MAX_FAILED_VERIFY_ATTEMPTS; i++) {
      assert.throws(
        () =>
          authService.verifyChallenge({
            challengeId: challenge.challengeId,
            publicKey,
            signature: badSig,
            origin: 'http://localhost:5173',
          }),
        (err: unknown) =>
          err instanceof AuthError && err.code === 'INVALID_SIGNATURE'
      )
    }

    // Challenge should now be gone
    const goodSig = signMessage(keypair, challenge.message)
    assert.throws(
      () =>
        authService.verifyChallenge({
          challengeId: challenge.challengeId,
          publicKey,
          signature: goodSig,
          origin: 'http://localhost:5173',
        }),
      (err: unknown) =>
        err instanceof AuthError && err.code === 'CHALLENGE_NOT_FOUND'
    )
  })
})
