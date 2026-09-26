import { faLock } from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'

interface PrivacyNoticeProps {
  variant?: 'inline' | 'callout'
  text?: string
}

export default function PrivacyNotice({
  variant = 'inline',
  text = 'Personal treatment documents are reviewed privately and are never shown on this campaign page.',
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
