type Props = {
  icon: string
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'value' | 'alert' | 'movement' | 'sales' | 'purchase' | 'production'
  trend?: { label: string; positive?: boolean }
}

const toneClass: Record<NonNullable<Props['tone']>, string> = {
  default: 'metric-products',
  value: 'metric-value',
  alert: 'metric-alert',
  movement: 'metric-movement',
  sales: 'metric-sales',
  purchase: 'metric-purchase',
  production: 'metric-production',
}

export function DashboardMetricCard({ icon, label, value, hint, tone = 'default', trend }: Props) {
  return (
    <div className={`dashboard-metric ${toneClass[tone]}`}>
      <span className="dashboard-metric-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {hint ? <small>{hint}</small> : null}
        {trend ? (
          <small className={trend.positive === false ? 'dash-trend-negative' : 'dash-trend-positive'}>
            {trend.label}
          </small>
        ) : null}
      </div>
    </div>
  )
}
