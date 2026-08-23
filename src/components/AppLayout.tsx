import { NavLink, Outlet } from 'react-router-dom'
import { useToast } from '../lib/toast'

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/produtos', label: 'Produtos' },
  { to: '/categorias', label: 'Categorias' },
  { to: '/fornecedores', label: 'Fornecedores' },
  { to: '/faturas', label: 'Faturas' },
  { to: '/fabricacao', label: 'Fabricação' },
  { to: '/movimentacoes', label: 'Movimentações' },
  { to: '/relatorios', label: 'Relatórios' },
]

export function AppLayout() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">CE</div>
          <h1>Controle de Estoque</h1>
          <p>Gestão local · offline-first</p>
        </div>
        <nav className="nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        <Outlet />
      </main>
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
