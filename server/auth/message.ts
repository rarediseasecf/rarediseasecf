/**
 * Builds the exact UTF-8 string the donor wallet must sign.
 * The frontend must never author or modify this message.
 */

export interface WalletVerificationMessageParams {
  publicKey: string
  nonce: string
  appOriginHost: string
  network: string
  issuedAt: Date
  expiresAt: Date
}

export function buildWalletVerificationMessage(
  params: WalletVerificationMessageParams
): string {
  const issuedAtIso = params.issuedAt.toISOString()
  const expiresAtIso = params.expiresAt.toISOString()

  return [
    'RareDiseaseCF wants you to confirm control of your Solana wallet.',
    '',
    'Purpose: Prepare a Devnet donation account. No funds will move.',
    `Wallet: ${params.publicKey}`,
    `Network: ${params.network}`,
    `Domain: ${params.appOriginHost}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAtIso}`,
    `Expiration Time: ${expiresAtIso}`,
    '',
    'Only sign this message if you are on the official RareDiseaseCF website.',
  ].join('\n')
}
