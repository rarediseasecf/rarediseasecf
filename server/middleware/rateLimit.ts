/**
 * Fixed-window, per-IP rate limiter (in-memory, single instance).
 * Use a shared store (e.g. Redis) if the API ever runs on multiple instances.
 */
import type { Request, Response, NextFunction, RequestHandler } from 'express'

export interface RateLimitOptions {
  /** Bucket name — limits are tracked separately per bucket */
  name: string
  windowMs: number
  max: number
}

interface WindowState {
  count: number
  resetAt: number
}

export class RateLimiter {
  private readonly windows = new Map<string, WindowState>()

  /** Returns seconds until reset when blocked, or 0 when allowed. */
  hit(key: string, windowMs: number, max: number, now = Date.now()): number {
    const current = this.windows.get(key)
    if (!current || current.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs })
      return 0
    }
    current.count += 1
    if (current.count > max) {
      return Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    }
    return 0
  }

  cleanup(now = Date.now()): void {
    for (const [key, state] of this.windows) {
      if (state.resetAt <= now) this.windows.delete(key)
    }
  }

  middleware(opts: RateLimitOptions): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = `${opts.name}:${req.ip ?? 'unknown'}`
      const retryAfter = this.hit(key, opts.windowMs, opts.max)
      if (retryAfter > 0) {
        res.setHeader('Retry-After', String(retryAfter))
        res.status(429).json({
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please wait a moment and try again.',
          },
        })
        return
      }
      next()
    }
  }
}
