/**
 * DevnetNotice
 * Network disclosure — used in wallet dialog, connected state areas.
 * NOT shown on the patient submission page.
 */
import { faCircle } from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'
import { IS_MAINNET } from '../lib/network'

interface DevnetNoticeProps {
  className?: string
}

export default function DevnetNotice({ className }: DevnetNoticeProps) {
  return (
    <p className={`devnet-notice${className ? ` ${className}` : ''}`} role="note">
      <span className="devnet-notice__icon" aria-hidden="true">
        <FaIcon icon={faCircle} size="xs" />
      </span>
      {IS_MAINNET
        ? 'Solana Mainnet — donations are real USDC, held in on-chain escrow and paid only to the verified hospital.'
        : 'Solana Devnet — use a test wallet with Devnet USDC. Devnet tokens have no real value.'}
    </p>
  )
}
