import type { Request, Response, NextFunction } from 'express'
import type { ServerConfig } from '../config.js'
import { AuthError } from './types.js'
import type { AuthService } from './authService.js'

/** Simple in-memory rate limit: max challenges per IP per window. */
const CHALLENGE_RATE_LIMIT = 20
const CHALLENGE_RATE_WINDOW_MS = 15 * 60 * 1000

interface RateBucket {
  count: number
  windowStart: number
}

const challengeRateByIp = new Map<string, RateBucket>()

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || req.ip || 'unknown'
  }
  return req.ip || 'unknown'
}

function assertChallengeRateLimit(ip: string): void {
  const now = Date.now()
  const bucket = challengeRateByIp.get(ip)
  if (!bucket || now - bucket.windowStart > CHALLENGE_RATE_WINDOW_MS) {
    challengeRateByIp.set(ip, { count: 1, windowStart: now })
    return
  }
  if (bucket.count >= CHALLENGE_RATE_LIMIT) {
    throw new AuthError(
      'RATE_LIMITED',
      'Too many confirmation requests. Please try again shortly.',
      429
    )
  }
  bucket.count += 1
}

function cookieOptions(config: ServerConfig) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: config.cookieSecure,
    maxAge: config.sessionTtlMs,
  }
}

function clearCookieOptions(config: ServerConfig) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: config.cookieSecure,
  }
}

export function createAuthRouter(
  config: ServerConfig,
  authService: AuthService
) {
  // Express Router is created by the caller via app.use with handlers below
  // to keep typing simple without importing express.Router at module load quirks.
  return {
    challenge: async (req: Request, res: Response, next: NextFunction) => {
      try {
        assertChallengeRateLimit(clientIp(req))

        const publicKey =
          typeof req.body?.publicKey === 'string' ? req.body.publicKey.trim() : ''

        if (!publicKey) {
          throw new AuthError(
            'INVALID_PUBLIC_KEY',
            'A valid wallet address is required.',
            400
          )
        }

        const result = authService.issueChallenge({
          publicKey,
          origin: String(req.headers.origin ?? ''),
          userAgent:
            typeof req.headers['user-agent'] === 'string'
              ? req.headers['user-agent']
              : undefined,
        })

        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    verify: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const challengeId =
          typeof req.body?.challengeId === 'string'
            ? req.body.challengeId.trim()
            : ''
        const publicKey =
          typeof req.body?.publicKey === 'string' ? req.body.publicKey.trim() : ''
        const signature =
          typeof req.body?.signature === 'string' ? req.body.signature.trim() : ''

        const { session, response } = authService.verifyChallenge({
          challengeId,
          publicKey,
          signature,
          origin: String(req.headers.origin ?? ''),
        })

        res.cookie(config.sessionCookieName, session.sessionId, cookieOptions(config))
        res.status(200).json(response)
      } catch (err) {
        next(err)
      }
    },

    session: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId =
          typeof req.cookies?.[config.sessionCookieName] === 'string'
            ? req.cookies[config.sessionCookieName]
            : undefined

        const result = authService.getSession(sessionId)

        if (!result.authenticated && sessionId) {
          // Clear expired/stale cookie quietly
          res.clearCookie(config.sessionCookieName, clearCookieOptions(config))
        }

        res.status(200).json(result)
      } catch (err) {
        next(err)
      }
    },

    logout: async (req: Request, res: Response, next: NextFunction) => {
      try {
        const sessionId =
          typeof req.cookies?.[config.sessionCookieName] === 'string'
            ? req.cookies[config.sessionCookieName]
            : undefined

        authService.logout(sessionId)
        res.clearCookie(config.sessionCookieName, clearCookieOptions(config))
        res.status(200).json({ authenticated: false })
      } catch (err) {
        next(err)
      }
    },
  }
}
