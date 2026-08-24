import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { BootScreen } from './components/BootScreen'
import { BRAND } from './lib/branding'
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
  const [startupError, setStartupError] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [passwordChangeError, setPasswordChangeError] = useState('')
  const [passwordChangeBusy, setPasswordChangeBusy] = useState(false)
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
        const message = err instanceof Error ? err.message : 'Falha na inicialização'
        setStartupError(message)
        push(message, 'err')
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
      <div className="login-screen">
        <div className="login-shell" data-testid="login-page">
          <section className="login-brand" aria-label="Identidade do sistema">
            <div className="login-brand-content">
              <img src={BRAND.logoSrc} alt={BRAND.company} className="login-logo" />
              <span className="login-brand-eyebrow">{BRAND.productLine}</span>
              <h1>{BRAND.module}</h1>
              <p>{BRAND.tagline}</p>
            </div>
            <div className="login-brand-footer">
              <span>Gestão segura e eficiente</span>
              <strong>{BRAND.company}</strong>
            </div>
          </section>

          <section className="login-panel">
            <div className="login-panel-heading">
              <span className="login-panel-icon" aria-hidden>
                <svg viewBox="0 0 24 24">
                  <path d="M12 2a5 5 0 0 0-5 5v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 7V7a3 3 0 0 1 6 0v2H9Zm3 4a2 2 0 0 1 1 3.73V19h-2v-2.27A2 2 0 0 1 12 13Z" />
                </svg>
              </span>
              <div>
                <span className="login-kicker">Bem-vindo</span>
                <h2>Acesso ao sistema</h2>
                <p>Informe suas credenciais para continuar.</p>
              </div>
            </div>
          <form
            className="stack login-form"
            onSubmit={(e: FormEvent) => {
              e.preventDefault()
              if (startupError || loginBusy) return
              setLoginError('')
              setLoginBusy(true)
              void unwrap(api.login({ username, password }))
                .then((session) => {
                  setAuth(session)
                  setPassword('')
                })
                .catch((err) => {
                  const message = err instanceof Error ? err.message : 'Falha no acesso'
                  setLoginError(message)
                  push(message, 'err')
                })
                .finally(() => setLoginBusy(false))
            }}
          >
            {startupError ? (
              <div className="alert alert-error" role="alert" data-testid="startup-error">
                Falha ao iniciar o sistema: {startupError}. Feche o aplicativo e abra novamente. Se
                continuar, envie esta mensagem ao suporte.
              </div>
            ) : null}
            {loginError ? (
              <div className="alert alert-error" role="alert" data-testid="login-error">
                {loginError}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="login-user">Usuário</label>
              <input
                id="login-user"
                data-testid="input-login-user"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  setLoginError('')
                }}
                disabled={loginBusy || Boolean(startupError)}
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
                onChange={(e) => {
                  setPassword(e.target.value)
                  setLoginError('')
                }}
                disabled={loginBusy || Boolean(startupError)}
                autoComplete="current-password"
              />
            </div>
            <button
              className="btn btn-primary"
              data-testid="btn-login-submit"
              type="submit"
              disabled={loginBusy || Boolean(startupError)}
            >
              {loginBusy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
            <p className="login-support">Acesso protegido · Dados armazenados localmente</p>
          </section>
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
              if (passwordChangeBusy) return
              setPasswordChangeError('')
              if (newPassword !== confirmPassword) {
                const message = 'A confirmação não confere com a nova senha'
                setPasswordChangeError(message)
                push(message, 'err')
                return
              }
              setPasswordChangeBusy(true)
              void unwrap(
                Promise.race([
                  api.changePassword({
                    currentPassword,
                    newPassword,
                  }),
                  new Promise<never>((_, reject) => {
                    window.setTimeout(
                      () => reject(new Error('A troca de senha demorou mais que o esperado. Tente novamente.')),
                      15_000,
                    )
                  }),
                ]),
              )
                .then((session) => {
                  setAuth(session)
                  setCurrentPassword('')
                  setNewPassword('')
                  setConfirmPassword('')
                  push('Senha alterada')
                })
                .catch((err) => {
                  const message = err instanceof Error ? err.message : 'Falha ao alterar senha'
                  setPasswordChangeError(message)
                  push(message, 'err')
                })
                .finally(() => setPasswordChangeBusy(false))
            }}
          >
            {passwordChangeError ? (
              <div className="alert alert-error" role="alert" data-testid="change-password-error">
                {passwordChangeError}
              </div>
            ) : null}
            <div className="field">
              <label htmlFor="change-current">Senha atual</label>
              <input
                id="change-current"
                data-testid="input-change-current"
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value)
                  setPasswordChangeError('')
                }}
                disabled={passwordChangeBusy}
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
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  setPasswordChangeError('')
                }}
                disabled={passwordChangeBusy}
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
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  setPasswordChangeError('')
                }}
                disabled={passwordChangeBusy}
                autoComplete="new-password"
              />
            </div>
            <button
              className="btn btn-primary"
              data-testid="btn-change-password-submit"
              type="submit"
              disabled={passwordChangeBusy}
            >
              {passwordChangeBusy ? 'Salvando…' : 'Salvar senha'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={passwordChangeBusy}
              onClick={handleLogout}
            >
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
