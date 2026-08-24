import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '../components/AppLayout'
import { ModalForm } from '../components/ModalForm'
import { api, unwrap } from '../lib/api'
import { BRAND } from '../lib/branding'
import { useClientBrand } from '../lib/client-brand'
import { roleLabel } from '../lib/format'
import { useTheme } from '../lib/theme'
import { useToast } from '../lib/toast'
import type { ClientBrand, LicenseStatus, LocalDiagnostics, UpdateStatus, User } from '@shared/types'

function formatUpdateStatus(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Aguardando verificação'
    case 'checking':
      return 'A verificar atualizações…'
    case 'available':
      return `Nova versão disponível: ${status.version}`
    case 'not-available':
      return `A aplicação está atualizada (${status.version})`
    case 'downloading':
      return `A transferir atualização… ${status.percent}%`
    case 'downloaded':
      return `Versão ${status.version} pronta para instalar`
    case 'error':
      return `Erro: ${status.message}`
    case 'disabled':
      return status.reason
    default:
      return 'Estado desconhecido'
  }
}

export function SettingsPage() {
  const { user } = useOutletContext<AppOutletContext>()
  const isAdmin = user.role === 'admin'
  const { push } = useToast()
  const { theme, setTheme } = useTheme()
  const { brand, saveBrand } = useClientBrand()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dbPath, setDbPath] = useState('')
  const [lastBackupPath, setLastBackupPath] = useState('')
  const [version, setVersion] = useState('')
  const [packaged, setPackaged] = useState(false)
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null)
  const [diagnostics, setDiagnostics] = useState<LocalDiagnostics | null>(null)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [busy, setBusy] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [clientName, setClientName] = useState(brand.name)
  const [clientLogo, setClientLogo] = useState(brand.logoDataUrl)
  const [newUserName, setNewUserName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<'admin' | 'operador'>('operador')
  const [userFormOpen, setUserFormOpen] = useState(false)
  const [passwordFormOpen, setPasswordFormOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetUser, setResetUser] = useState<User | null>(null)
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState('')

  useEffect(() => {
    setClientName(brand.name)
    setClientLogo(brand.logoDataUrl)
  }, [brand])

  const loadInfo = useCallback(async () => {
    try {
      const info = await unwrap(api.getAppInfo())
      setDbPath(info.dbPath)
      setVersion(info.version)
      setPackaged(info.packaged)
      setLicenseStatus(await unwrap(api.getLicenseStatus()))
      if (isAdmin) {
        setUsers(await unwrap(api.listUsers()))
        setUpdateStatus(await unwrap(api.getUpdateStatus()))
        setDiagnostics(await unwrap(api.getDiagnostics()))
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível carregar as configurações', 'err')
    }
  }, [push, isAdmin])

  useEffect(() => {
    void loadInfo()
    if (!isAdmin) return undefined
    const unsubscribe = api.onUpdateStatus((status) => setUpdateStatus(status))
    return unsubscribe
  }, [loadInfo, isAdmin])

  async function handleExportBackup() {
    setBusy(true)
    try {
      const result = await unwrap(api.exportBackup())
      if (result.saved) {
        setLastBackupPath(result.path ?? '')
        push(result.path ? `Cópia de segurança salva em ${result.path}` : 'Cópia de segurança exportada')
      } else {
        push('Criação da cópia de segurança cancelada')
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível criar a cópia de segurança', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleRestoreBackup() {
    setBusy(true)
    try {
      const result = await unwrap(api.restoreBackup())
      if (result.restored) {
        push('Cópia de segurança restaurada. Preparando o sistema…')
        await loadInfo()
      } else {
        push('Restauração cancelada')
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível restaurar a cópia de segurança', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleCheckUpdates() {
    setBusy(true)
    try {
      const status = await unwrap(api.checkForUpdates())
      setUpdateStatus(status)
      push(formatUpdateStatus(status))
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível verificar as atualizações', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleInstallUpdate() {
    setBusy(true)
    try {
      await unwrap(api.installUpdate())
      push('Reiniciando para aplicar a atualização…')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível instalar a atualização', 'err')
      setBusy(false)
    }
  }

  async function handleSupportPackage() {
    setBusy(true)
    try {
      const result = await unwrap(api.exportSupportPackage())
      push(result.saved ? `Pacote de suporte guardado em ${result.path}` : 'Geração do pacote cancelada')
    } catch (err) { push(err instanceof Error ? err.message : 'Não foi possível gerar o pacote de suporte', 'err') } finally { setBusy(false) }
  }

  function readLogoFile(file: File) {
    if (!file.type.startsWith('image/')) {
      push('Escolha um ficheiro de imagem válido', 'err')
      return
    }
    if (file.size > 2_000_000) {
      push('A logo deve ter no máximo 2 MB', 'err')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      setClientLogo(result)
    }
    reader.readAsDataURL(file)
  }

  function onLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) readLogoFile(file)
    e.target.value = ''
  }

  async function handleSaveBrand() {
    setBusy(true)
    try {
      const payload: ClientBrand = {
        name: clientName,
        logoDataUrl: clientLogo,
      }
      await saveBrand(payload)
      push('Identidade visual salva com sucesso')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível guardar a identidade visual', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateUser() {
    setBusy(true)
    try {
      await unwrap(
        api.createUser({
          name: newUserName,
          username: newUsername,
          password: newUserPassword,
          role: newUserRole,
        }),
      )
      setNewUserName('')
      setNewUsername('')
      setNewUserPassword('')
      setNewUserRole('operador')
      setUsers(await unwrap(api.listUsers()))
      push('Utilizador registado com sucesso')
      setUserFormOpen(false)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível registar o utilizador', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleUser(user: User) {
    setBusy(true)
    try {
      await unwrap(api.setUserActive(user.id, !user.active))
      setUsers(await unwrap(api.listUsers()))
      push(user.active ? 'Utilizador desativado' : 'Utilizador ativado')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível atualizar o utilizador', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      push('As palavras-passe introduzidas não coincidem', 'err')
      return
    }
    setBusy(true)
    try {
      await unwrap(
        api.changePassword({
          currentPassword,
          newPassword,
        }),
      )
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      push('Palavra-passe atualizada com sucesso')
      setPasswordFormOpen(false)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível atualizar a palavra-passe', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleResetPassword() {
    if (!resetUser) return
    if (temporaryPassword !== confirmTemporaryPassword) {
      push('As palavras-passe temporárias não coincidem', 'err')
      return
    }
    setBusy(true)
    try {
      await unwrap(api.resetUserPassword(resetUser.id, temporaryPassword))
      setUsers(await unwrap(api.listUsers()))
      setTemporaryPassword('')
      setConfirmTemporaryPassword('')
      setResetUser(null)
      push('Palavra-passe temporária definida. O utilizador deverá alterá-la na próxima entrada.')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Não foi possível redefinir a palavra-passe', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings-page" data-testid="settings-page">
      <div className="page-header">
        <div className="settings-page-intro">
          <span className="settings-page-icon" aria-hidden>⚙</span>
          <div>
            <h2>Sobre o sistema</h2>
            <p>{isAdmin ? 'Informações da aplicação e gestão das preferências do sistema.' : 'Informações da aplicação e preferências da sua conta.'}</p>
          </div>
        </div>
      </div>

      <div className="stack">
        {isAdmin ? (
        <div className="panel" data-testid="settings-client-brand">
          <h3>Identidade visual da empresa</h3>
          <p className="muted">
            Personalize o nome e a logo exibidos no menu. A Cortexis Tech continuará identificada como desenvolvedora.
          </p>
          <div className="client-brand-editor">
            {clientLogo ? (
              <img src={clientLogo} alt="Logo da empresa" className="client-brand-preview" />
            ) : (
              <div className="client-brand-preview empty">Sua logo aparecerá aqui</div>
            )}
            <div className="stack stack-grow">
              <div className="field">
                <label htmlFor="client-name">Nome da empresa</label>
                <input
                  id="client-name"
                  data-testid="input-client-name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex.: Indústria Silva"
                  maxLength={80}
                />
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                hidden
                data-testid="input-client-logo"
                onChange={onLogoChange}
              />
              <div className="row-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => fileRef.current?.click()}
                >
                  Escolher logo
                </button>
                {clientLogo ? (
                  <button type="button" className="btn btn-ghost" onClick={() => setClientLogo('')}>
                    Remover logo
                  </button>
                ) : null}
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="btn-save-client-brand"
                  disabled={busy}
                  onClick={() => void handleSaveBrand()}
                >
                  Guardar identidade visual
                </button>
              </div>
            </div>
          </div>
        </div>
        ) : null}

        <div className="panel settings-about" data-testid="settings-app-info">
          <div className="settings-about-heading">
            <img src={BRAND.logoSrc} alt={BRAND.company} className="brand-panel-logo" />
            <div><span className="brand-eyebrow">{BRAND.productLine}</span><h3>{BRAND.module}</h3><a className="link-accent" href={BRAND.website} target="_blank" rel="noreferrer">Desenvolvido por {BRAND.company} · {BRAND.websiteLabel}</a></div>
          </div>
          <div className="settings-about-grid">
            <div><span>Versão</span><strong data-testid="app-version">{version || '—'}</strong><small>{packaged ? 'Aplicação instalada' : 'Ambiente de desenvolvimento'}</small></div>
            <div><span>Licença</span>{licenseStatus?.active ? <><strong>{licenseStatus.details.edition === 'professional' ? 'Profissional' : 'Padrão'}</strong><small>{licenseStatus.details.customer} · {licenseStatus.details.expiresAt ? `válida até ${new Date(licenseStatus.details.expiresAt).toLocaleDateString('pt-PT')}` : 'validade perpétua'}</small></> : <small>{licenseStatus?.reason ?? 'A consultar…'}</small>}</div>
          </div>
          {isAdmin ? <details className="settings-technical-details"><summary>Informações técnicas</summary><p className="muted info-row break-all">Base de dados: <code data-testid="db-path">{dbPath || '—'}</code></p>{licenseStatus?.active ? <p className="muted info-row break-all">Identificação da licença: <code>{licenseStatus.details.licenseId}</code></p> : null}</details> : null}
        </div>

        {isAdmin ? (
        <div className="panel" data-testid="settings-users">
          <div className="settings-section-header">
            <div>
              <h3>Utilizadores registados</h3>
              <p className="muted">Consulte os acessos existentes e altere o respetivo estado.</p>
            </div>
            <div className="row-actions">
              <button className="btn btn-ghost" disabled={busy} onClick={() => setPasswordFormOpen(true)}>
                Alterar a minha palavra-passe
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => setUserFormOpen(true)}>
                <span aria-hidden>+</span> Novo utilizador
              </button>
            </div>
          </div>
          <div className="table-wrap settings-table">
            <table className="collection-table settings-users-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Utilizador</th>
                  <th>Perfil</th>
                  <th>Estado</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.username}</td>
                    <td>{roleLabel(u.role)}</td>
                    <td><span className={`badge badge-${u.active ? 'entrada' : 'saida'}`}>{u.active ? 'Ativo' : 'Inativo'}</span>{u.id === user.id ? <small className="current-user-label">Sessão atual</small> : null}</td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => void handleToggleUser(u)}>
                        {u.active ? 'Inativar' : 'Ativar'}
                      </button>
                      {u.id !== user.id ? <button className="btn btn-ghost" onClick={() => setResetUser(u)}>Redefinir palavra-passe</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        ) : null}

        {isAdmin && userFormOpen ? (
          <ModalForm
            title="Novo utilizador"
            hint="Defina os dados de acesso. Na primeira entrada, o utilizador deverá alterar a palavra-passe."
            onClose={() => setUserFormOpen(false)}
            onSubmit={(event) => { event.preventDefault(); void handleCreateUser() }}
            submitLabel="Registar utilizador"
          >
            <div className="form-grid">
              <div className="field full"><label htmlFor="new-user-name">Nome completo *</label><input id="new-user-name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} required /></div>
              <div className="field"><label htmlFor="new-user-username">Utilizador *</label><input id="new-user-username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} autoComplete="off" required /></div>
              <div className="field"><label htmlFor="new-user-role">Perfil *</label><select id="new-user-role" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'operador')}><option value="operador">Operador</option><option value="admin">Administrador</option></select></div>
              <div className="field full"><label htmlFor="new-user-password">Palavra-passe temporária *</label><input id="new-user-password" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} minLength={10} maxLength={128} autoComplete="new-password" required /><small>Mínimo de 10 caracteres, com maiúscula, minúscula, número e carácter especial.</small></div>
            </div>
          </ModalForm>
        ) : null}

        {!isAdmin ? (
          <div className="panel settings-account-panel" data-testid="settings-account">
            <div><h3>A minha conta</h3><p className="muted">{user.name} · {roleLabel(user.role)}</p></div>
            <button className="btn btn-primary" onClick={() => setPasswordFormOpen(true)}>Alterar palavra-passe</button>
          </div>
        ) : null}

        {passwordFormOpen ? (
          <ModalForm
            title="Alterar a minha palavra-passe"
            hint="Utilize pelo menos 10 caracteres, com maiúscula, minúscula, número e carácter especial."
            onClose={() => setPasswordFormOpen(false)}
            onSubmit={(event) => { event.preventDefault(); void handleChangePassword() }}
            submitLabel="Guardar palavra-passe"
          >
            <div className="form-grid">
              <div className="field full"><label htmlFor="settings-current-password">Palavra-passe atual *</label><input id="settings-current-password" data-testid="input-settings-current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required /></div>
              <div className="field"><label htmlFor="settings-new-password">Nova palavra-passe *</label><input id="settings-new-password" data-testid="input-settings-new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={10} maxLength={128} autoComplete="new-password" required /></div>
              <div className="field"><label htmlFor="settings-confirm-password">Confirmar palavra-passe *</label><input id="settings-confirm-password" data-testid="input-settings-confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={10} maxLength={128} autoComplete="new-password" required /></div>
            </div>
          </ModalForm>
        ) : null}

        {isAdmin && resetUser ? (
          <ModalForm
            title={`Redefinir palavra-passe · ${resetUser.name}`}
            hint="Defina uma palavra-passe temporária forte. O utilizador deverá alterá-la na próxima entrada."
            onClose={() => { setResetUser(null); setTemporaryPassword(''); setConfirmTemporaryPassword('') }}
            onSubmit={(event) => { event.preventDefault(); void handleResetPassword() }}
            submitLabel="Guardar palavra-passe temporária"
          >
            <div className="form-grid">
              <div className="field"><label htmlFor="reset-user-password">Palavra-passe temporária *</label><input id="reset-user-password" data-testid="input-reset-user-password" type="password" value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} minLength={10} maxLength={128} autoComplete="new-password" required /></div>
              <div className="field"><label htmlFor="reset-user-password-confirm">Confirmar palavra-passe *</label><input id="reset-user-password-confirm" data-testid="input-reset-user-password-confirm" type="password" value={confirmTemporaryPassword} onChange={(e) => setConfirmTemporaryPassword(e.target.value)} minLength={10} maxLength={128} autoComplete="new-password" required /></div>
              <p className="muted full">Use maiúscula, minúscula, número e carácter especial. As últimas cinco palavras-passe não podem ser reutilizadas.</p>
            </div>
          </ModalForm>
        ) : null}

        <div className="panel" data-testid="settings-appearance">
          <h3>Aparência</h3>
          <p className="muted">Escolha a aparência mais confortável para trabalhar.</p>
          <div className="theme-options">
            <button
              type="button"
              className={`theme-option ${theme === 'light' ? 'active' : ''}`}
              data-testid="theme-light"
              onClick={() => setTheme('light')}
            >
              <span className="theme-option-preview theme-option-preview--light" aria-hidden />
              <span>
                <strong>Claro</strong>
                <small>Fundo claro</small>
              </span>
            </button>
            <button
              type="button"
              className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
              data-testid="theme-dark"
              onClick={() => setTheme('dark')}
            >
              <span className="theme-option-preview theme-option-preview--dark" aria-hidden />
              <span>
                <strong>Escuro</strong>
                <small>Fundo escuro</small>
              </span>
            </button>
          </div>
        </div>

        {isAdmin ? (
          <>
        <div className="panel" data-testid="settings-diagnostics">
          <h3>Diagnóstico local</h3>
          <p className="muted">Estado técnico sem expor dados de produtos, clientes, palavras-passe ou chaves.</p>
          <div className="settings-about-grid">
            <div><span>Base de dados</span><strong>v{diagnostics?.databaseVersion ?? '—'}</strong><small>{diagnostics?.integrity === 'ok' ? 'Integridade verificada' : 'A verificar…'}</small></div>
            <div><span>Última cópia automática</span><strong>{diagnostics?.lastAutomaticBackup ?? 'Ainda não criada'}</strong><small>{diagnostics?.availableDiskBytes == null ? 'Espaço em disco indisponível' : `${(diagnostics.availableDiskBytes / 1_073_741_824).toFixed(1)} GB livres`}</small></div>
          </div>
          <p className="muted">Erros recentes: {diagnostics?.recentErrors.length ?? 0}</p>
          <button className="btn btn-ghost" disabled={busy} onClick={() => void handleSupportPackage()}>Gerar pacote de suporte</button>
        </div>
        <div className="panel" data-testid="settings-backup">
          <h3>Cópia de segurança</h3>
          <p className="muted">
            Escolha onde guardar uma cópia protegida dos dados do sistema.
            A restauração substitui todos os dados atuais.
          </p>
          <div className="row-actions">
            <button
              className="btn btn-primary"
              data-testid="btn-export-backup"
              disabled={busy}
              onClick={() => void handleExportBackup()}
            >
              Escolher localização e guardar
            </button>
            <button
              className="btn btn-danger"
              data-testid="btn-restore-backup"
              disabled={busy}
              onClick={() => void handleRestoreBackup()}
            >
              Restaurar cópia
            </button>
          </div>
          {lastBackupPath ? (
            <p className="muted info-row break-all" data-testid="last-backup-path">
              Última cópia guardada em: <code>{lastBackupPath}</code>
            </p>
          ) : null}
        </div>

        <div className="panel" data-testid="settings-updates">
          <h3>Atualizações</h3>
          <p className="muted" data-testid="update-status">
            {formatUpdateStatus(updateStatus)}
          </p>
          <div className="row-actions">
            <button
              className="btn btn-ghost"
              data-testid="btn-check-updates"
              disabled={busy}
              onClick={() => void handleCheckUpdates()}
            >
              Verificar atualizações
            </button>
            {updateStatus.state === 'downloaded' ? (
              <button
                className="btn btn-primary"
                data-testid="btn-install-update"
                disabled={busy}
                onClick={() => void handleInstallUpdate()}
              >
                Reiniciar e atualizar
              </button>
            ) : null}
          </div>
        </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
