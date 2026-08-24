import type { ReactNode } from 'react'

export function CollectionPageHeader({
  icon,
  description,
  count,
  singular,
  plural,
  children,
}: {
  icon: ReactNode
  description: string
  count: number
  singular: string
  plural: string
  children?: ReactNode
}) {
  return (
    <div className="page-header collection-page-header">
      <div className="collection-page-intro">
        <span className="collection-page-icon" aria-hidden>{icon}</span>
        <div>
          <p>{description}</p>
          <span className="collection-page-count">
            {count} {count === 1 ? singular : plural}
          </span>
        </div>
      </div>
      {children ? <div className="collection-page-actions">{children}</div> : null}
    </div>
  )
}

export function CollectionEmpty({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) {
  return (
    <div className="empty collection-empty">
      <span aria-hidden>{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}
