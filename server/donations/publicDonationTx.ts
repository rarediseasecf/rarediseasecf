import { explorerTxUrl } from '../chain/solanaRelayer.js'

const ONCHAIN_CHANNELS = new Set(['devnet', 'mainnet-beta'])

/** Explorer link for a recorded donation; null for legacy off-chain rows. */
export function publicDonationTx(row: {
  txHash: string | null
  channel: string
}): { txHash: string; explorerUrl: string } | null {
  if (!row.txHash || !ONCHAIN_CHANNELS.has(row.channel)) return null
  return { txHash: row.txHash, explorerUrl: explorerTxUrl(row.txHash, row.channel) }
}
