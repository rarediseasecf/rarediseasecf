/**
 * Relative /api auth client — uses Vite proxy in development.
 * Always sends credentials so the HTTP-only session cookie is set and read.
 * Never stores session IDs in localStorage or sessionStorage.
 */

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
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

export class AuthApiError extends Error {
  readonly code: AuthErrorCode
  readonly status: number

  constructor(code: AuthErrorCode, message: string, status: number) {
    super(message)
    this.name = 'AuthApiError'
    this.code = code
    this.status = status
  }
}

export interface ChallengeResponse {
  challengeId: string
  message: string
  expiresAt: string
}

export interface SessionAuthenticated {
  authenticated: true
  walletAddress: string
  expiresAt: string
}

export interface SessionUnauthenticated {
  authenticated: false
}

export type SessionResponse = SessionAuthenticated | SessionUnauthenticated

interface ErrorPayload {
  error?: {
    code?: string
    message?: string
  }
}

async function parseJson<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new AuthApiError(
      'NETWORK_ERROR',
      'Account confirmation is temporarily unavailable.',
      0
    )
  }

  if (!res.ok) {
    let code: AuthErrorCode = 'UNKNOWN'
    let message = 'Account confirmation is temporarily unavailable.'
    try {
      const body = await parseJson<ErrorPayload>(res)
      if (body.error?.code) {
        code = body.error.code as AuthErrorCode
      }
      if (body.error?.message) {
        message = body.error.message
      }
    } catch {
      // keep defaults
    }
    throw new AuthApiError(code, message, res.status)
  }

  return parseJson<T>(res)
}

export async function requestChallenge(
  publicKey: string
): Promise<ChallengeResponse> {
  return request<ChallengeResponse>('/api/auth/challenge', {
    method: 'POST',
    body: JSON.stringify({ publicKey }),
  })
}

export async function verifyChallenge(payload: {
  challengeId: string
  publicKey: string
  signature: string
}): Promise<SessionAuthenticated> {
  return request<SessionAuthenticated>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchSession(): Promise<SessionResponse> {
  return request<SessionResponse>('/api/auth/session', {
    method: 'GET',
  })
}

export async function logoutSession(): Promise<SessionUnauthenticated> {
  return request<SessionUnauthenticated>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}
