import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BRAND } from '../lib/branding'
import { useClientBrand } from '../lib/client-brand'
import { roleLabel } from '../lib/format'
import { useToast } from '../lib/toast'
import type { User } from '@shared/types'

export type AppOutletContext = { user: User }

const cadastroPaths = ['/produtos', '/categorias', '/fornecedores', '/receitas']
const operacaoPaths = ['/faturas', '/fabricacao', '/movimentacoes']

const cadastroLinks = [
  { to: '/produtos', label: 'Produtos', testId: 'nav-produtos' },
  { to: '/categorias', label: 'Categorias', testId: 'nav-categorias' },
  { to: '/fornecedores', label: 'Fornecedores', testId: 'nav-fornecedores' },
  { to: '/receitas', label: 'Receitas', testId: 'nav-receitas' },
]

const operacaoLinks = [
  { to: '/faturas', label: 'Faturas de compra', testId: 'nav-faturas' },
  { to: '/fabricacao', label: 'Fabricação', testId: 'nav-fabricacao' },
  { to: '/movimentacoes', label: 'Ajustes de inventário', testId: 'nav-movimentacoes' },
]

const mainLinks = [
  {
    to: '/relatorios',
    label: 'Relatórios',
    testId: 'nav-relatorios',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M5 19V5h2v14H5zm6 0V9h2v10h-2zm6 0V3h2v16h-2z" />
      </svg>
    ),
  },
  {
    to: '/configuracoes',
    label: 'Configurações',
    testId: 'nav-configuracoes',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4zm8.94 4.34a8.9 8.9 0 0 0-.12-1.34l2-1.56-2-3.46-2.38 1a9.1 9.1 0 0 0-2.32-1.34L16 2h-4l-.12 2.64a9.1 9.1 0 0 0-2.32 1.34l-2.38-1-2 3.46 2 1.56a8.9 8.9 0 0 0 0 2.68l-2 1.56 2 3.46 2.38-1a9.1 9.1 0 0 0 2.32 1.34L12 22h4l.12-2.64a9.1 9.1 0 0 0 2.32-1.34l2.38 1 2-3.46-2-1.56a8.9 8.9 0 0 0 .12-1.34z" />
      </svg>
    ),
  },
]

const routeTitles: Record<string, string> = {
  '/': 'Painel',
  '/produtos': 'Produtos',
  '/categorias': 'Categorias',
  '/fornecedores': 'Fornecedores',
  '/receitas': 'Receitas',
  '/faturas': 'Faturas de compra',
  '/fabricacao': 'Fabricação',
  '/movimentacoes': 'Ajustes de inventário',
  '/relatorios': 'Relatórios',
  '/configuracoes': 'Configurações',
}

function isGroupRoute(pathname: string, paths: string[]) {
  return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

function NavGroup({
  label,
  testId,
  links,
  paths,
  open,
  onToggle,
}: {
  label: string
  testId: string
  links: { to: string; label: string; testId: string }[]
  paths: string[]
  open: boolean
  onToggle: () => void
}) {
  const { pathname } = useLocation()
  const active = isGroupRoute(pathname, paths)

  return (
    <div className={`nav-group ${open ? 'open' : ''} ${active ? 'active' : ''}`}>
      <button
        type="button"
        className="nav-group-toggle"
        data-testid={testId}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="nav-icon">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
          </svg>
        </span>
        <span className="nav-label">{label}</span>
        <span className="nav-chevron" aria-hidden />
      </button>
      {open ? (
        <div className="nav-sub">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} data-testid={link.testId}>
              {link.label}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function AppLayout({
  user,
  onLogout,
}: {
  user: User
  onLogout: () => void
}) {
  const { toasts, dismiss } = useToast()
  const { brand } = useClientBrand()
  const { pathname } = useLocation()
  const currentTitle = routeTitles[pathname] ?? BRAND.module
  const [cadastroOpen, setCadastroOpen] = useState(true)
  const [operacaoOpen, setOperacaoOpen] = useState(true)
  const clientName = brand.name.trim() || 'Sua empresa'
  const currentRole = roleLabel(user.role)

  useEffect(() => {
    if (isGroupRoute(pathname, cadastroPaths)) setCadastroOpen(true)
    if (isGroupRoute(pathname, operacaoPaths)) setOperacaoOpen(true)
  }, [pathname])

  return (
    <>
      <div className="app-shell" data-testid="app-shell">
        <aside className="sidebar">
          <div className="brand">
            {brand.logoDataUrl ? (
              <img
                src={brand.logoDataUrl}
                alt={clientName}
                className="brand-logo client"
                data-testid="client-logo"
              />
            ) : (
              <div className="brand-logo-placeholder" data-testid="client-logo-placeholder">
                <strong>Logo da empresa</strong>
                <span>Configure em Configurações</span>
              </div>
            )}
            <p className="brand-module">{clientName}</p>
          </div>

          <nav className="nav" aria-label="Navegação principal">
            <NavLink to="/" end data-testid="nav-dashboard">
              <span className="nav-icon">
                <svg viewBox="0 0 24 24" aria-hidden>
                  <path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm8 0h8v-9h-8v9zm0-16v5h8V4h-8z" />
                </svg>
              </span>
              <span className="nav-label">Painel</span>
            </NavLink>

            <NavGroup
              label="Cadastro"
              testId="nav-cadastro"
              links={cadastroLinks}
              paths={cadastroPaths}
              open={cadastroOpen}
              onToggle={() => setCadastroOpen((v) => !v)}
            />

            <NavGroup
              label="Operações"
              testId="nav-operacoes"
              links={operacaoLinks}
              paths={operacaoPaths}
              open={operacaoOpen}
              onToggle={() => setOperacaoOpen((v) => !v)}
            />

            {mainLinks.map((link) => (
              <NavLink key={link.to} to={link.to} data-testid={link.testId}>
                <span className="nav-icon">{link.icon}</span>
                <span className="nav-label">{link.label}</span>
              </NavLink>
            ))}
          </nav>

          <footer className="sidebar-footer">
            <span className="sidebar-footer-label">Desenvolvido por</span>
            <strong>{BRAND.company}</strong>
            <a className="link-accent" href={BRAND.website} target="_blank" rel="noreferrer">
              {BRAND.websiteLabel}
            </a>
          </footer>
        </aside>

        <div className="main-area">
          <header className="topbar">
            <div className="topbar-copy">
              <span className="topbar-eyebrow">{BRAND.productLine}</span>
              <h1 className="topbar-title" data-testid="page-title">
                {currentTitle}
              </h1>
            </div>
            <div className="row-actions">
              <div className="topbar-badge">
                {user.name} · {currentRole}
              </div>
              <button className="btn btn-ghost" data-testid="btn-logout" onClick={onLogout}>
                Sair
              </button>
            </div>
          </header>

          <main className="content">
            <Outlet context={{ user } satisfies AppOutletContext} />
          </main>
        </div>
      </div>

      <div className="toasts" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`toast ${t.tone}`}
            aria-label={`${t.message}. Fechar aviso`}
            onClick={() => dismiss(t.id)}
          >
            {t.message}
          </button>
        ))}
      </div>
    </>
  )
}
