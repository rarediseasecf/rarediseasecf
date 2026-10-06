import { faLock } from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'

interface PrivacyNoticeProps {
  variant?: 'inline' | 'callout'
  text?: string
}

export default function PrivacyNotice({
  variant = 'inline',
  text = 'Medical documents are reviewed privately by the hospital and are never shown on this campaign page or written on-chain.',
}: PrivacyNoticeProps) {
  return (
    <div className={`privacy-notice privacy-notice--${variant}`} role="note">
      <span className="privacy-notice__icon" aria-hidden="true">
        <FaIcon icon={faLock} />
      </span>
      <p className="privacy-notice__text">{text}</p>
    </div>
  )
}
