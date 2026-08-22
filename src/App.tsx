import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { api, unwrap } from './lib/api'
import { useToast } from './lib/toast'
import { AlertsPage } from './pages/AlertsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { DashboardPage } from './pages/DashboardPage'
import { MovementsPage } from './pages/MovementsPage'
import { ProductsPage } from './pages/ProductsPage'
import { ReportsPage } from './pages/ReportsPage'
import { SuppliersPage } from './pages/SuppliersPage'

export default function App() {
  const { push } = useToast()
  const [ready, setReady] = useState(false)
  const [needsSeed, setNeedsSeed] = useState(false)

  useEffect(() => {
    async function boot() {
      try {
        const info = await unwrap(api.init())
        setNeedsSeed(!info.seeded)
        setReady(true)
      } catch (err) {
        push(err instanceof Error ? err.message : 'Falha na inicialização', 'err')
        setReady(true)
      }
    }
    void boot()
  }, [push])

  if (!ready) {
    return <div className="empty">Abrindo Controle de Estoque…</div>
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route
          index
          element={
            <DashboardPage needsSeed={needsSeed} onSeedDone={() => setNeedsSeed(false)} />
          }
        />
        <Route path="alertas" element={<AlertsPage />} />
        <Route path="produtos" element={<ProductsPage />} />
        <Route path="categorias" element={<CategoriesPage />} />
        <Route path="fornecedores" element={<SuppliersPage />} />
        <Route path="movimentacoes" element={<MovementsPage />} />
        <Route path="relatorios" element={<ReportsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
