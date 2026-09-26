/**
 * Which Solana cluster the frontend talks to. Must match the API's SOLANA_CLUSTER.
 */
export type SolanaNetwork = 'devnet' | 'mainnet-beta'

function normalizeNetwork(raw: string | undefined): SolanaNetwork {
  const value = raw?.trim().toLowerCase()
  return value === 'mainnet-beta' || value === 'mainnet'
    ? 'mainnet-beta'
    : 'devnet'
}

export const SOLANA_NETWORK: SolanaNetwork = normalizeNetwork(
  import.meta.env.VITE_SOLANA_NETWORK
)

export const IS_MAINNET = SOLANA_NETWORK === 'mainnet-beta'

/** Human label, e.g. "Solana Devnet". */
export const NETWORK_NAME = IS_MAINNET ? 'Solana Mainnet' : 'Solana Devnet'

export const RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL?.trim() ||
  (IS_MAINNET
    ? 'https://api.mainnet-beta.solana.com'
    : 'https://api.devnet.solana.com')
