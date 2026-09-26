export function buildReviewerVerificationMessage(params: {
  publicKey: string
  nonce: string
  appOriginHost: string
  network: string
  issuedAt: Date
  expiresAt: Date
}): string {
  const issuedAtIso = params.issuedAt.toISOString()
  const expiresAtIso = params.expiresAt.toISOString()

  return [
    'RareDiseaseCF wants you to confirm control of your Solana wallet.',
    '',
    'Purpose: Access the reviewer workspace for this Devnet demonstration. No funds will move.',
    `Wallet: ${params.publicKey}`,
    `Network: ${params.network}`,
    `Domain: ${params.appOriginHost}`,
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAtIso}`,
    `Expiration Time: ${expiresAtIso}`,
    '',
    'Only sign this message if you are accessing the official RareDiseaseCF reviewer workspace.',
  ].join('\n')
}
