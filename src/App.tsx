import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { BootScreen } from './components/BootScreen'
import { api, unwrap } from './lib/api'
import { useToast } from './lib/toast'
import { CategoriesPage } from './pages/CategoriesPage'
import { DashboardPage } from './pages/DashboardPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { MovementsPage } from './pages/MovementsPage'
import { ProductionPage } from './pages/ProductionPage'
import { ProductsPage } from './pages/ProductsPage'
import { RecipesPage } from './pages/RecipesPage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { SuppliersPage } from './pages/SuppliersPage'
import type { AuthSession } from '@shared/types'

export default function App() {
  const { push } = useToast()
  const [ready, setReady] = useState(false)
  const [needsSeed, setNeedsSeed] = useState(false)
  const [auth, setAuth] = useState<AuthSession>({ authenticated: false, user: null })
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    async function boot() {
      try {
        const info = await unwrap(api.init())
        const session = await unwrap(api.authStatus())
        setAuth(session)
        setNeedsSeed(!info.seeded)
        setReady(true)
      } catch (err) {
        push(err instanceof Error ? err.message : 'Falha na inicialização', 'err')
        setReady(true)
      }
    }
    void boot()
  }, [push])

  function handleLogout() {
    void unwrap(api.logout())
      .then(() => {
        setAuth({ authenticated: false, user: null })
        setPassword('')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      })
      .catch((err) => push(err instanceof Error ? err.message : 'Falha ao sair', 'err'))
  }

  if (!ready) {
    return <BootScreen />
  }

  if (!auth.authenticated || !auth.user) {
    return (
      <div className="boot-screen">
        <div className="boot-card" data-testid="login-page">
          <h1 className="boot-title">Acesso ao sistema</h1>
          <form
            className="stack"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              void unwrap(api.login({ username, password }))
                .then((session) => {
                  setAuth(session)
                  setPassword('')
                })
                .catch((err) => push(err instanceof Error ? err.message : 'Falha no acesso', 'err'))
            }}
          >
            <div className="field">
              <label htmlFor="login-user">Usuário</label>
              <input
                id="login-user"
                data-testid="input-login-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>
            <div className="field">
              <label htmlFor="login-pass">Senha</label>
              <input
                id="login-pass"
                data-testid="input-login-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <button className="btn btn-primary" data-testid="btn-login-submit" type="submit">
              Entrar
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (auth.user.mustChangePassword) {
    return (
      <div className="boot-screen">
        <div className="boot-card" data-testid="change-password-page">
          <h1 className="boot-title">Trocar senha padrão</h1>
          <p className="muted">Por segurança, altere a senha antes de usar o sistema.</p>
          <form
            className="stack"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              if (newPassword !== confirmPassword) {
                push('A confirmação não confere com a nova senha', 'err')
                return
              }
              void unwrap(
                api.changePassword({
                  currentPassword,
                  newPassword,
                }),
              )
                .then((session) => {
                  setAuth(session)
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                  push('Senha alterada')
                })
                .catch((err) =>
                  push(err instanceof Error ? err.message : 'Falha ao alterar senha', 'err'),
                )
            }}
          >
            <div className="field">
              <label htmlFor="change-current">Senha atual</label>
              <input
                id="change-current"
                data-testid="input-change-current"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="field">
              <label htmlFor="change-new">Nova senha</label>
              <input
                id="change-new"
                data-testid="input-change-new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label htmlFor="change-confirm">Confirmar nova senha</label>
              <input
                id="change-confirm"
                data-testid="input-change-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <button className="btn btn-primary" data-testid="btn-change-password-submit" type="submit">
              Salvar senha
            </button>
            <button className="btn btn-ghost" type="button" onClick={handleLogout}>
              Sair
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<AppLayout user={auth.user} onLogout={handleLogout} />}>
        <Route
          index
          element={
            <DashboardPage needsSeed={needsSeed} onSeedDone={() => setNeedsSeed(false)} />
          }
        />
        <Route path="produtos" element={<ProductsPage />} />
        <Route path="categorias" element={<CategoriesPage />} />
        <Route path="fornecedores" element={<SuppliersPage />} />
        <Route path="receitas" element={<RecipesPage />} />
        <Route path="faturas" element={<InvoicesPage />} />
        <Route path="fabricacao" element={<ProductionPage />} />
        <Route path="movimentacoes" element={<MovementsPage />} />
        <Route path="relatorios" element={<ReportsPage />} />
        <Route path="configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
