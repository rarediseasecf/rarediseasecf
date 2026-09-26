import type { Response, CookieOptions } from 'express'
import type { ServerConfig } from '../config.js'

export function caseAccessCookieOptions(config: ServerConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: config.cookieSecure,
    maxAge: config.caseAccessTtlMs,
  }
}

export function clearCaseAccessCookieOptions(
  config: ServerConfig
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: config.cookieSecure,
  }
}

export function setCaseAccessCookie(
  res: Response,
  config: ServerConfig,
  rawToken: string
): void {
  res.cookie(
    config.caseAccessCookieName,
    rawToken,
    caseAccessCookieOptions(config)
  )
}

export function clearCaseAccessCookie(
  res: Response,
  config: ServerConfig
): void {
  res.clearCookie(
    config.caseAccessCookieName,
    clearCaseAccessCookieOptions(config)
  )
}
