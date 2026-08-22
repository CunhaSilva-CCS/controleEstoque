import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, unwrap } from './api'
import type { AlertsSummary } from '@shared/types'

type AlertsContextValue = {
  summary: AlertsSummary | null
  loading: boolean
  refresh: () => Promise<void>
}

const AlertsContext = createContext<AlertsContextValue | null>(null)

const empty: AlertsSummary = { total: 0, lowCount: 0, zeroCount: 0, items: [] }

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<AlertsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setSummary(await unwrap(api.getAlerts('all')))
    } catch {
      setSummary(empty)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ summary, loading, refresh }),
    [summary, loading, refresh],
  )

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>
}

export function useAlerts() {
  const ctx = useContext(AlertsContext)
  if (!ctx) throw new Error('useAlerts fora do provider')
  return ctx
}

/** Mensagem de alerta após movimentação, se o saldo ficou ≤ mínimo. */
export function minStockWarning(
  name: string,
  stock: number,
  minStock: number,
  unit: string,
): string | null {
  if (stock <= 0) {
    return `Alerta: ${name} ficou com estoque zerado (mínimo: ${minStock} ${unit})`
  }
  if (stock <= minStock) {
    return `Alerta: ${name} abaixo do mínimo (${stock} ${unit} ≤ ${minStock} ${unit})`
  }
  return null
}
