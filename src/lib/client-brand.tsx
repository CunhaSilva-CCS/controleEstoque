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
import { BRAND } from './branding'
import type { ClientBrand } from '@shared/types'

const defaultBrand: ClientBrand = { name: BRAND.company, logoDataUrl: BRAND.logoSrc }

function withDefaultBrand(input: ClientBrand): ClientBrand {
  return {
    name: input.name.trim() || defaultBrand.name,
    logoDataUrl: input.logoDataUrl.trim() || defaultBrand.logoDataUrl,
  }
}

type ClientBrandContextValue = {
  brand: ClientBrand
  ready: boolean
  saveBrand: (input: ClientBrand) => Promise<ClientBrand>
}

const ClientBrandContext = createContext<ClientBrandContextValue | null>(null)

export function ClientBrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<ClientBrand>(defaultBrand)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    void unwrap(api.getClientBrand())
      .then((next) => setBrand(withDefaultBrand(next)))
      .catch(() => setBrand(defaultBrand))
      .finally(() => setReady(true))
  }, [])

  const saveBrand = useCallback(async (input: ClientBrand) => {
    const persistedInput = {
      name: input.name.trim() === BRAND.company ? '' : input.name,
      logoDataUrl: input.logoDataUrl === BRAND.logoSrc ? '' : input.logoDataUrl,
    }
    const saved = withDefaultBrand(await unwrap(api.saveClientBrand(persistedInput)))
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
