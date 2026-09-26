/** Truncate a Solana base58 address for display, e.g. "7xK3…9Dk4". */
export function truncateAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

/** Truncate a transaction signature for display, e.g. "4xKq9a…Zp3T8n". */
export function truncateSignature(signature: string): string {
  if (signature.length <= 14) return signature
  return `${signature.slice(0, 6)}…${signature.slice(-6)}`
}
