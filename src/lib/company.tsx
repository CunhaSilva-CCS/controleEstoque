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
import type { Company } from '@shared/types'

type CompanyContextValue = {
  companies: Company[]
  current: Company | null
  ready: boolean
  refresh: () => Promise<void>
  switchCompany: (id: string) => Promise<void>
}

const CompanyContext = createContext<CompanyContextValue | null>(null)

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [current, setCurrent] = useState<Company | null>(null)
  const [ready, setReady] = useState(false)

  const load = useCallback(async () => {
    const [list, currentCompany] = await Promise.all([
      unwrap(api.listCompanies()),
      unwrap(api.getCurrentCompany()),
    ])
    setCompanies(list)
    setCurrent(currentCompany)
  }, [])

  useEffect(() => {
    void load()
      .catch(() => {
        setCompanies([])
        setCurrent(null)
      })
      .finally(() => setReady(true))
  }, [load])

  const switchCompany = useCallback(async (id: string) => {
    await unwrap(api.setCurrentCompany(id))
    window.location.reload()
  }, [])

  const value = useMemo(
    () => ({ companies, current, ready, refresh: load, switchCompany }),
    [companies, current, ready, load, switchCompany],
  )

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider')
  return ctx
}
