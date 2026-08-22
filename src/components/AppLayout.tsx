import { NavLink, Outlet, Link } from 'react-router-dom'
import { useAlerts } from '../lib/alerts'
import { useToast } from '../lib/toast'

const links = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/alertas', label: 'Alertas', badge: true },
  { to: '/produtos', label: 'Produtos' },
  { to: '/categorias', label: 'Categorias' },
  { to: '/fornecedores', label: 'Fornecedores' },
  { to: '/movimentacoes', label: 'Movimentações' },
  { to: '/relatorios', label: 'Relatórios' },
]

export function AppLayout() {
  const { toasts, dismiss } = useToast()
  const { summary } = useAlerts()
  const alertCount = summary?.total ?? 0

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
            <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
              <span>{link.label}</span>
              {link.badge && alertCount > 0 ? (
                <span className="nav-badge" aria-label={`${alertCount} alertas`}>
                  {alertCount}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="content">
        {alertCount > 0 ? (
          <div className="alert-banner" role="status">
            <div>
              <strong>
                {alertCount === 1
                  ? '1 produto abaixo do estoque mínimo'
                  : `${alertCount} produtos abaixo do estoque mínimo`}
              </strong>
              <p>
                {summary?.zeroCount ?? 0} zerado(s) · {summary?.lowCount ?? 0} com estoque baixo
              </p>
            </div>
            <Link className="btn btn-primary" to="/alertas">
              Ver alertas
            </Link>
          </div>
        ) : null}
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
