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
import type { ClientBrand } from '@shared/types'

const emptyBrand: ClientBrand = { name: '', logoDataUrl: '' }

type ClientBrandContextValue = {
  brand: ClientBrand
  ready: boolean
  saveBrand: (input: ClientBrand) => Promise<ClientBrand>
}

const ClientBrandContext = createContext<ClientBrandContextValue | null>(null)

export function ClientBrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<ClientBrand>(emptyBrand)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void unwrap(api.getClientBrand())
      .then((next) => setBrand(next))
      .catch(() => setBrand(emptyBrand))
      .finally(() => setReady(true))
  }, [])

  const saveBrand = useCallback(async (input: ClientBrand) => {
    const saved = await unwrap(api.saveClientBrand(input))
    setBrand(saved)
    return saved
  }, [])

  const value = useMemo(
    () => ({ brand, ready, saveBrand }),
    [brand, ready, saveBrand],
  )

  return <ClientBrandContext.Provider value={value}>{children}</ClientBrandContext.Provider>
}

export function useClientBrand(): ClientBrandContextValue {
  const ctx = useContext(ClientBrandContext)
  if (!ctx) throw new Error('useClientBrand must be used within ClientBrandProvider')
  return ctx
}
