import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type Toast = { id: string; message: string; tone: 'ok' | 'err' | 'warn' }

type ToastContextValue = {
  toasts: Toast[]
  push: (message: string, tone?: 'ok' | 'err' | 'warn') => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message: string, tone: 'ok' | 'err' | 'warn' = 'ok') => {
      const id = crypto.randomUUID()
      setToasts((prev) => [...prev, { id, message, tone }])
      window.setTimeout(() => dismiss(id), tone === 'warn' ? 5600 : 4200)
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast fora do provider')
  return ctx
}
