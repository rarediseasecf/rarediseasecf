import { faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'

interface SolanaTxLinkProps {
  explorerUrl: string | null
  ariaLabel?: string
}

/** Small "View on Solana" link to an on-chain transaction. */
export default function SolanaTxLink({
  explorerUrl,
  ariaLabel = 'View this donation on Solana Explorer',
}: SolanaTxLinkProps) {
  if (!explorerUrl) return null
  return (
    <a
      className="solana-tx-link"
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
    >
      View on Solana <FaIcon icon={faArrowUpRightFromSquare} size="xs" />
    </a>
  )
}
