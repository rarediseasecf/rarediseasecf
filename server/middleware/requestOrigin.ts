import type { Request, Response, NextFunction } from 'express'
import type { ServerConfig } from '../config.js'
import { AuthError } from '../auth/types.js'

/**
 * Validate Origin for state-changing POST requests.
 * Prefers Vite same-origin proxy; still rejects unexpected origins.
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

    if (origin !== config.appOrigin) {
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
