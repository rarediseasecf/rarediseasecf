import { useState } from 'react'
import { faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'

interface InfoAccordionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

export default function InfoAccordion({ title, children, defaultOpen = false }: InfoAccordionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`info-accordion${open ? ' info-accordion--open' : ''}`}>
      <button
        className="info-accordion__trigger"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="info-accordion__title">{title}</span>
        <span className="info-accordion__chevron" aria-hidden="true">
          <FaIcon icon={open ? faChevronUp : faChevronDown} size="xs" />
        </span>
      </button>

      {open && (
        <div className="info-accordion__body" role="region">
          {children}
        </div>
      )}
    </div>
  )
}
