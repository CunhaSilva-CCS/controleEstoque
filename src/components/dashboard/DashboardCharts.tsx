import type { DashboardDailyPoint, DashboardMovementTrendPoint } from '@shared/types'

type BarChartProps = {
  data: DashboardDailyPoint[]
  color?: string
  formatValue?: (value: number) => string
  height?: number
}

export function MiniBarChart({ data, color = 'var(--accent)', formatValue, height = 120 }: BarChartProps) {
  const max = Math.max(...data.map((point) => point.value), 1)
  const width = 100 / data.length

  return (
    <div className="dash-chart" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Gráfico de barras">
        {data.map((point, index) => {
          const barHeight = (point.value / max) * 88
          const x = index * width + width * 0.15
          const barWidth = width * 0.7
          const y = 94 - barHeight
          const title = `${point.date}: ${formatValue ? formatValue(point.value) : point.value}`
          return (
            <rect
              key={point.date}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={1.2}
              fill={color}
              opacity={point.value > 0 ? 0.85 : 0.18}
            >
              <title>{title}</title>
            </rect>
          )
        })}
      </svg>
      <div className="dash-chart-labels">
        {data.filter((_, i) => i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)).map((point) => (
          <span key={point.date}>{formatShortDate(point.date)}</span>
        ))}
      </div>
    </div>
  )
}

type StackedBarProps = {
  data: DashboardMovementTrendPoint[]
  height?: number
}

export function MovementStackedChart({ data, height = 120 }: StackedBarProps) {
  const max = Math.max(...data.map((point) => point.entrada + point.saida + point.ajuste), 1)
  const width = 100 / data.length

  return (
    <div className="dash-chart" style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Gráfico de movimentações">
        {data.map((point, index) => {
          const total = point.entrada + point.saida + point.ajuste
          const scale = total / max
          const barHeight = scale * 88
          const x = index * width + width * 0.15
          const barWidth = width * 0.7
          let y = 94 - barHeight
          const segments = [
            { value: point.entrada, color: 'var(--ok-text)' },
            { value: point.saida, color: 'var(--danger)' },
            { value: point.ajuste, color: 'var(--warn-text)' },
          ]
          return (
            <g key={point.date}>
              {segments.map((segment) => {
                if (segment.value <= 0) return null
                const segmentHeight = total > 0 ? (segment.value / total) * barHeight : 0
                const rect = (
                  <rect
                    key={segment.color}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={segmentHeight}
                    fill={segment.color}
                    opacity={0.82}
                  >
                    <title>{`${point.date}: ${segment.value} mov.`}</title>
                  </rect>
                )
                y += segmentHeight
                return rect
              })}
            </g>
          )
        })}
      </svg>
      <div className="dash-chart-labels">
        {data.filter((_, i) => i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)).map((point) => (
          <span key={point.date}>{formatShortDate(point.date)}</span>
        ))}
      </div>
    </div>
  )
}

type DonutProps = {
  segments: { label: string; value: number; color: string }[]
  size?: number
}

export function DonutChart({ segments, size = 140 }: DonutProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1
  const radius = 42
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="dash-donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" role="img" aria-label="Gráfico circular">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--line)" strokeWidth="12" opacity="0.35" />
        {segments.map((segment) => {
          const length = (segment.value / total) * circumference
          const dash = `${length} ${circumference - length}`
          const rotation = (offset / total) * 360 - 90
          offset += segment.value
          return (
            <circle
              key={segment.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="12"
              strokeDasharray={dash}
              transform={`rotate(${rotation} 50 50)`}
              strokeLinecap="butt"
            >
              <title>{`${segment.label}: ${segment.value}`}</title>
            </circle>
          )
        })}
        <text x="50" y="48" textAnchor="middle" className="dash-donut-total">
          {total}
        </text>
        <text x="50" y="58" textAnchor="middle" className="dash-donut-label">
          produtos
        </text>
      </svg>
      <ul className="dash-donut-legend">
        {segments.map((segment) => (
          <li key={segment.label}>
            <span style={{ background: segment.color }} aria-hidden />
            {segment.label}
            <strong>{segment.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

type HorizontalBarProps = {
  items: { label: string; value: number; secondary?: string }[]
  formatValue: (value: number) => string
  color?: string
}

export function HorizontalBarList({ items, formatValue, color = 'var(--accent)' }: HorizontalBarProps) {
  const max = Math.max(...items.map((item) => item.value), 1)
  if (items.length === 0) {
    return <div className="empty">Sem dados para apresentar.</div>
  }
  return (
    <ul className="dash-hbar-list">
      {items.map((item) => (
        <li key={item.label}>
          <div className="dash-hbar-head">
            <span title={item.label}>{item.label}</span>
            <strong>{formatValue(item.value)}</strong>
          </div>
          <div className="dash-hbar-track">
            <div className="dash-hbar-fill" style={{ width: `${(item.value / max) * 100}%`, background: color }} />
          </div>
          {item.secondary ? <small>{item.secondary}</small> : null}
        </li>
      ))}
    </ul>
  )
}

function formatShortDate(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${day}/${month}`
}
