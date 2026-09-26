export interface ChallengeRecord {
  challengeId: string
  nonce: string
  publicKey: string
  message: string
  issuedAt: Date
  expiresAt: Date
  consumedAt: Date | null
  expectedOrigin: string
  userAgentHash: string
  createdAt: Date
  /** Failed verification attempts before challenge is invalidated. */
  failedAttempts: number
}

export interface SessionRecord {
  sessionId: string
  publicKey: string
  createdAt: Date
  expiresAt: Date
  lastSeenAt: Date
}

export type AuthErrorCode =
  | 'INVALID_PUBLIC_KEY'
  | 'INVALID_REQUEST'
  | 'ORIGIN_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'CHALLENGE_NOT_FOUND'
  | 'CHALLENGE_EXPIRED'
  | 'CHALLENGE_ALREADY_USED'
  | 'WALLET_MISMATCH'
  | 'INVALID_SIGNATURE'
  | 'INTERNAL_ERROR'

export interface ApiErrorBody {
  error: {
    code: AuthErrorCode
    message: string
  }
}

export interface ChallengeResponse {
  challengeId: string
  message: string
  expiresAt: string
}

export interface SessionAuthenticatedResponse {
  authenticated: true
  walletAddress: string
  expiresAt: string
}

export interface SessionUnauthenticatedResponse {
  authenticated: false
}

export type SessionResponse =
  | SessionAuthenticatedResponse
  | SessionUnauthenticatedResponse

export class AuthError extends Error {
  readonly code: AuthErrorCode
  readonly status: number

  constructor(code: AuthErrorCode, message: string, status: number) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.status = status
  }
}
