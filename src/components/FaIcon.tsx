/**
 * Shared Font Awesome icon helper — keeps sizing consistent.
 */
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

interface FaIconProps {
  icon: IconDefinition
  className?: string
  title?: string
  /** Extra FA size class e.g. "fa-lg" — prefer className for layout */
  size?: 'xs' | 'sm' | 'lg' | '1x' | '2x'
}

export default function FaIcon({
  icon,
  className = '',
  title,
  size = '1x',
}: FaIconProps) {
  return (
    <FontAwesomeIcon
      icon={icon}
      className={`fa-icon ${className}`.trim()}
      size={size}
      title={title}
      aria-hidden={title ? undefined : true}
    />
  )
}
