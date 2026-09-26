import { faCheck, faCircle } from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'

interface CheckItem {
  label: string
  verified?: boolean
}

interface VerificationChecklistProps {
  items: CheckItem[]
}

export default function VerificationChecklist({
  items,
}: VerificationChecklistProps) {
  return (
    <ul className="verification-checklist" aria-label="Verification status">
      {items.map((item, idx) => (
        <li key={idx} className="verification-checklist__item">
          <span
            className={`verification-checklist__icon${
              item.verified === false
                ? ' verification-checklist__icon--pending'
                : ''
            }`}
            aria-hidden="true"
          >
            <FaIcon
              icon={item.verified === false ? faCircle : faCheck}
              size="sm"
            />
          </span>
          <span className="verification-checklist__label">{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
