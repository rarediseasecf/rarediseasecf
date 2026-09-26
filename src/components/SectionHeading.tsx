interface SectionHeadingProps {
  title: string
  subtitle?: string
  centered?: boolean
  as?: 'h1' | 'h2' | 'h3'
}

export default function SectionHeading({
  title,
  subtitle,
  centered = false,
  as: Tag = 'h2',
}: SectionHeadingProps) {
  return (
    <div className={`section-heading${centered ? ' section-heading--centered' : ''}`}>
      <Tag className="section-heading__title">{title}</Tag>
      {subtitle && <p className="section-heading__subtitle">{subtitle}</p>}
    </div>
  )
}
