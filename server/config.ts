/**
 * Server configuration — Day 2–5.
 * Case storage requires DATABASE_URL and DATA_ENCRYPTION_KEY (fail closed).
 */

import { parseEncryptionKey, type EncryptionKeyMaterial } from './security/encryption.js'
import { AppError } from './errors.js'
import {
  parseProviderBootstrapRecords,
  parseReviewerBootstrapWallets,
  type ProviderBootstrapRecord,
} from './reviewer/bootstrap.js'
import {
  parseHospitalBootstrapRecords,
  type HospitalBootstrapRecord,
} from './hospitals/bootstrap.js'
import { resolveUploadRoot } from './cases/documentStorage.js'
import { createHash } from 'node:crypto'

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

export interface ServerConfig {
  port: number
  appOrigin: string
  appOriginHost: string
  sessionCookieName: string
  sessionTtlMs: number
  challengeTtlMs: number
  networkLabel: string
  isProduction: boolean
  cookieSecure: boolean
  databaseUrl: string
  caseAccessCookieName: string
  caseAccessTtlMs: number
  encryption: EncryptionKeyMaterial
  reviewerSessionCookieName: string
  reviewerSessionTtlMs: number
  reviewerBootstrapWallets: string[]
  providerBootstrapRecords: ProviderBootstrapRecord[]
  hospitalBootstrapRecords: HospitalBootstrapRecord[]
  /** Local document storage root (not S3) */
  caseUploadDir: string
  /** HMAC secret for hospital magic links (derived from encryption key if unset) */
  magicLinkHmacSecret: string
  /** Magic-link TTL — capped at 24h */
  magicLinkTtlMs: number
  /** Shared secret for /admin hospital whitelist UI */
  adminSecret: string
  smtpHost: string | null
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string | null
  smtpPass: string | null
  smtpFrom: string
  /** On-chain escrow settings — required; the API does not start without them */
  solana: SolanaConfig
  /** Legacy wallet-reviewer APIs (/api/reviewer/*); off in production by default */
  legacyReviewerEnabled: boolean
  /** How often expired campaigns are swept and paid out to the hospital */
  expirySweepIntervalMs: number
  /** Per-IP API rate limits; on in production by default */
  rateLimitEnabled: boolean
}

export type SolanaCluster = 'devnet' | 'mainnet-beta'

export interface SolanaConfig {
  rpcUrl: string
  cluster: SolanaCluster
  programId: string
  usdcMint: string
  /** Server-only. Program admin + registered verifier. */
  platformAuthoritySecretKey: string
}

function parseBoolFlag(value: string | undefined, fallback: boolean): boolean {
  const raw = value?.trim().toLowerCase()
  if (!raw) return fallback
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

const DEFAULT_PROGRAM_ID = '3ChG4eL5EvhrELWbAZs3cdVt8P9X1CfrRwfF6gqfKG9d'

function loadSolanaConfig(env: NodeJS.ProcessEnv): SolanaConfig {
  const usdcMint = env.USDC_MINT?.trim()
  const platformAuthoritySecretKey = env.PLATFORM_AUTHORITY_SECRET_KEY?.trim()
  if (!usdcMint || !platformAuthoritySecretKey) {
    throw new AppError(
      'SOLANA_CONFIG_MISSING',
      'On-chain escrow is required: set USDC_MINT and PLATFORM_AUTHORITY_SECRET_KEY (see docs/ENV.md).',
      500
    )
  }
  const clusterRaw = env.SOLANA_CLUSTER?.trim() || 'devnet'
  if (clusterRaw !== 'devnet' && clusterRaw !== 'mainnet-beta') {
    throw new AppError(
      'SOLANA_CLUSTER_INVALID',
      'SOLANA_CLUSTER must be "devnet" or "mainnet-beta".',
      500
    )
  }
  const cluster: SolanaCluster = clusterRaw
  return {
    rpcUrl:
      env.SOLANA_RPC_URL?.trim() ||
      (cluster === 'mainnet-beta'
        ? 'https://api.mainnet-beta.solana.com'
        : 'https://api.devnet.solana.com'),
    cluster,
    programId: env.PROGRAM_ID?.trim() || DEFAULT_PROGRAM_ID,
    usdcMint,
    platformAuthoritySecretKey,
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProduction = env.NODE_ENV === 'production'
  const appOrigin = (env.APP_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '')
  const sessionTtlHours = parsePositiveInt(env.SESSION_TTL_HOURS, 24)
  const challengeTtlMinutes = parsePositiveInt(env.CHALLENGE_TTL_MINUTES, 5)
  const caseAccessTtlDays = parsePositiveInt(env.CASE_ACCESS_TTL_DAYS, 30)
  const reviewerSessionTtlHours = parsePositiveInt(
    env.REVIEWER_SESSION_TTL_HOURS,
    8
  )

  const databaseUrl = env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new AppError(
      'DATABASE_URL_MISSING',
      'DATABASE_URL is required. Start Postgres (docker compose up -d) and set DATABASE_URL in .env.',
      500
    )
  }

  let encryption: EncryptionKeyMaterial
  try {
    encryption = parseEncryptionKey(
      env.DATA_ENCRYPTION_KEY,
      env.DATA_ENCRYPTION_KEY_ID ?? 'local-dev-v1'
    )
  } catch (err) {
    if (err instanceof AppError) throw err
    throw new AppError(
      'ENCRYPTION_KEY_INVALID',
      'DATA_ENCRYPTION_KEY is missing or malformed.',
      500
    )
  }

  const magicLinkTtlHours = Math.min(
    parsePositiveInt(env.MAGIC_LINK_TTL_HOURS, 24),
    24
  )

  const magicLinkHmacSecret =
    env.MAGIC_LINK_HMAC_SECRET?.trim() ||
    createHash('sha256')
      .update(encryption.key)
      .update('|magic-link-v1')
      .digest('hex')

  const adminSecret =
    env.ADMIN_SECRET?.trim() ||
    (isProduction
      ? ''
      : 'rdcf-demo-admin')

  if (isProduction && !adminSecret) {
    throw new AppError(
      'ADMIN_SECRET_MISSING',
      'ADMIN_SECRET is required in production for hospital whitelist admin.',
      500
    )
  }

  const solana = loadSolanaConfig(env)

  return {
    port: parsePositiveInt(env.PORT, 8787),
    appOrigin,
    appOriginHost: new URL(appOrigin).host,
    sessionCookieName: env.SESSION_COOKIE_NAME ?? 'rdcf_session',
    sessionTtlMs: sessionTtlHours * 60 * 60 * 1000,
    challengeTtlMs: challengeTtlMinutes * 60 * 1000,
    networkLabel: solana.cluster,
    isProduction,
    cookieSecure: isProduction || !isLocalhostOrigin(appOrigin),
    databaseUrl,
    caseAccessCookieName: env.CASE_ACCESS_COOKIE_NAME ?? 'rdcf_case_access',
    caseAccessTtlMs: caseAccessTtlDays * 24 * 60 * 60 * 1000,
    encryption,
    reviewerSessionCookieName:
      env.REVIEWER_SESSION_COOKIE_NAME ?? 'rdcf_reviewer_session',
    reviewerSessionTtlMs: reviewerSessionTtlHours * 60 * 60 * 1000,
    reviewerBootstrapWallets: parseReviewerBootstrapWallets(
      env.REVIEWER_BOOTSTRAP_WALLETS
    ),
    providerBootstrapRecords: parseProviderBootstrapRecords(
      env.PROVIDER_BOOTSTRAP_RECORDS
    ),
    hospitalBootstrapRecords: parseHospitalBootstrapRecords(
      env.HOSPITAL_WHITELIST_BOOTSTRAP
    ),
    caseUploadDir: resolveUploadRoot(env.CASE_UPLOAD_DIR),
    magicLinkHmacSecret,
    magicLinkTtlMs: magicLinkTtlHours * 60 * 60 * 1000,
    adminSecret,
    smtpHost: env.SMTP_HOST?.trim() || null,
    smtpPort: parsePositiveInt(env.SMTP_PORT, 587),
    smtpSecure: env.SMTP_SECURE === '1' || env.SMTP_SECURE === 'true',
    smtpUser: env.SMTP_USER?.trim() || null,
    smtpPass: env.SMTP_PASS?.trim() || null,
    smtpFrom: env.SMTP_FROM?.trim() || 'noreply@rarediseasecf.demo',
    solana,
    legacyReviewerEnabled: parseBoolFlag(
      env.LEGACY_REVIEWER_ENABLED,
      !isProduction
    ),
    expirySweepIntervalMs:
      parsePositiveInt(env.EXPIRY_SWEEP_INTERVAL_MINUTES, 60) * 60 * 1000,
    rateLimitEnabled: parseBoolFlag(env.RATE_LIMIT_ENABLED, isProduction),
  }
}
