import { statusLabel } from '../lib/format'

export function StatusBadge({ status }: { status?: string }) {
  const s = status ?? 'ok'
  return <span className={`badge badge-${s}`}>{statusLabel(s)}</span>
}
