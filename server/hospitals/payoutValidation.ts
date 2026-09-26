/**
 * Hospital payout destination chosen at verification.
 * Only USDC on Solana is live; fiat bank payouts are announced but not yet supported.
 */
import { PublicKey } from '@solana/web3.js'
import { AppError } from '../errors.js'

export const PAYOUT_METHODS = {
  USDC: 'USDC',
  FIAT: 'FIAT',
} as const

export type PayoutMethod = (typeof PAYOUT_METHODS)[keyof typeof PAYOUT_METHODS]

/** Encrypted at rest — never returned on public APIs */
export interface UsdcPayoutPayload {
  payoutMethod: typeof PAYOUT_METHODS.USDC
  network: 'solana'
  asset: 'USDC'
  walletAddress: string
  walletSuffix: string
  capturedAt: string
}

export const FIAT_PAYOUT_NOT_SUPPORTED_MESSAGE =
  'Fiat (bank) payouts are not supported yet — we are rolling them out soon. Choose Stablecoin (USDC on Solana) to continue.'

function isSolanaAddress(value: string): boolean {
  try {
    return new PublicKey(value).toBase58() === value
  } catch {
    return false
  }
}

export function validatePayoutSelection(raw: {
  payoutMethod?: unknown
  usdcWalletAddress?: unknown
}): UsdcPayoutPayload {
  const method =
    typeof raw.payoutMethod === 'string'
      ? raw.payoutMethod.trim().toUpperCase()
      : ''

  if (method === PAYOUT_METHODS.FIAT) {
    throw new AppError(
      'FIAT_PAYOUT_NOT_SUPPORTED',
      FIAT_PAYOUT_NOT_SUPPORTED_MESSAGE,
      400
    )
  }
  if (method !== PAYOUT_METHODS.USDC) {
    throw new AppError(
      'PAYOUT_METHOD_REQUIRED',
      'Choose how the institution will receive funds before approving.',
      400
    )
  }

  const walletAddress =
    typeof raw.usdcWalletAddress === 'string'
      ? raw.usdcWalletAddress.trim()
      : ''
  if (!walletAddress) {
    throw new AppError(
      'USDC_WALLET_REQUIRED',
      'Enter the institution’s Solana wallet address for USDC payouts.',
      400
    )
  }
  if (!isSolanaAddress(walletAddress)) {
    throw new AppError(
      'INVALID_USDC_WALLET',
      'Enter a valid Solana wallet address (base58, 32–44 characters).',
      400
    )
  }

  return {
    payoutMethod: PAYOUT_METHODS.USDC,
    network: 'solana',
    asset: 'USDC',
    walletAddress,
    walletSuffix: walletAddress.slice(-4),
    capturedAt: new Date().toISOString(),
  }
}
