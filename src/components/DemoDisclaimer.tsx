import { IS_MAINNET } from '../lib/network'

export const DEMO_DISCLAIMER =
  'Demonstration campaigns running on Solana Devnet — no real patient data, Devnet USDC has no real value.'

/** Devnet-only banner shown next to campaign lists. */
export default function DemoDisclaimer({ className }: { className?: string }) {
  if (IS_MAINNET) return null
  return (
    <p className={`demo-disclaimer${className ? ` ${className}` : ''}`} role="note">
      {DEMO_DISCLAIMER}
    </p>
  )
}
