import { useEffect, useRef, type KeyboardEvent } from 'react'
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons'
import FaIcon from './FaIcon'

interface SearchBoxProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Called on Enter, e.g. to open the first match */
  onSubmit?: () => void
  className?: string
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return (
    el.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
  )
}

export default function SearchBox({
  id,
  label,
  value,
  onChange,
  placeholder,
  onSubmit,
  className = '',
}: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape' && value) {
      e.preventDefault()
      onChange('')
    } else if (e.key === 'Enter' && onSubmit) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className={`search-box ${className}`.trim()}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <FaIcon icon={faMagnifyingGlass} className="search-box__icon" />
      <input
        ref={inputRef}
        id={id}
        type="search"
        className="search-box__input"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          className="search-box__clear"
          onClick={() => {
            onChange('')
            inputRef.current?.focus()
          }}
          aria-label="Clear search"
        >
          <FaIcon icon={faXmark} />
        </button>
      ) : (
        <kbd className="search-box__hint" aria-hidden="true">
          /
        </kbd>
      )}
    </div>
  )
}
