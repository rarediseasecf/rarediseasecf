import type { Request, Response, NextFunction } from 'express'
import type { ServerConfig } from '../config.js'
import { AuthError } from '../auth/types.js'

/**
 * Same-origin check: a browser always sends the real page Origin, so a
 * cross-site page cannot make it equal the host it is posting to. This lets
 * every domain alias of the deployment (custom domain, *.vercel.app) work.
 */
function isSameHost(req: Request, origin: string): boolean {
  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    return false
  }
  const forwarded = req.headers['x-forwarded-host']
  const host =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : '') ||
    req.headers.host
  return Boolean(host) && originHost === host
}

/**
 * Validate Origin for state-changing POST requests.
 * Accepts the configured app origin or the same host the request was sent to.
 */
export function createOriginGuard(config: ServerConfig) {
  return function requestOrigin(
    req: Request,
    _res: Response,
    next: NextFunction
  ): void {
    if (
      req.method === 'GET' ||
      req.method === 'HEAD' ||
      req.method === 'OPTIONS'
    ) {
      next()
      return
    }

    const origin = req.headers.origin

    // Same-origin requests via Vite proxy may omit Origin in some clients;
    // when present it must match the configured app origin exactly.
    if (!origin) {
      // Allow missing Origin for server-to-server / curl in development only.
      if (!config.isProduction) {
        next()
        return
      }
      next(
        new AuthError(
          'ORIGIN_NOT_ALLOWED',
          'This request is not allowed from your location.',
          403
        )
      )
      return
    }

    if (origin !== config.appOrigin && !isSameHost(req, origin)) {
      next(
        new AuthError(
          'ORIGIN_NOT_ALLOWED',
          'This request is not allowed from your location.',
          403
        )
      )
      return
    }

    next()
  }
}
