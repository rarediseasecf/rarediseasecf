interface HighlightProps {
  text: string
  tokens: string[]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Wraps case-insensitive matches of any token in <mark>. */
export default function Highlight({ text, tokens }: HighlightProps) {
  if (tokens.length === 0) return <>{text}</>
  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi')
  const parts = text.split(pattern)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="search-mark">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}
