import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import type { AppOutletContext } from '../components/AppLayout'
import { api, unwrap } from '../lib/api'
import { BRAND } from '../lib/branding'
import { useClientBrand } from '../lib/client-brand'
import { roleLabel } from '../lib/format'
import { useTheme } from '../lib/theme'
import { useToast } from '../lib/toast'
import type { ClientBrand, LicenseStatus, UpdateStatus, User } from '@shared/types'

function formatUpdateStatus(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Aguardando verificação'
    case 'checking':
      return 'Verificando atualizações…'
    case 'available':
      return `Nova versão disponível: ${status.version}`
    case 'not-available':
      return `Você está na versão mais recente (${status.version})`
    case 'downloading':
      return `Baixando atualização… ${status.percent}%`
    case 'downloaded':
      return `Versão ${status.version} pronta para instalar`
    case 'error':
      return `Erro: ${status.message}`
    case 'disabled':
      return status.reason
    default:
      return 'Status desconhecido'
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
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [busy, setBusy] = useState(false)
  const [users, setUsers] = useState<User[]>([])
  const [clientName, setClientName] = useState(brand.name)
  const [clientLogo, setClientLogo] = useState(brand.logoDataUrl)
  const [newUserName, setNewUserName] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState<'admin' | 'operador'>('operador')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

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
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao carregar informações', 'err')
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
        push('Exportação cancelada', 'err')
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao exportar a cópia de segurança', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleRestoreBackup() {
    setBusy(true)
    try {
      const result = await unwrap(api.restoreBackup())
      if (result.restored) {
        push('Cópia de segurança restaurada. Recarregando…')
        await loadInfo()
      } else {
        push('Restauração cancelada', 'err')
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao restaurar a cópia de segurança', 'err')
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
      push(err instanceof Error ? err.message : 'Falha ao verificar atualizações', 'err')
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
      push(err instanceof Error ? err.message : 'Falha ao instalar atualização', 'err')
      setBusy(false)
    }
  }

  function readLogoFile(file: File) {
    if (!file.type.startsWith('image/')) {
      push('Selecione um arquivo de imagem', 'err')
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
      push('Marca da empresa salva')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao salvar a marca', 'err')
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
      push('Usuário cadastrado')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao criar usuário', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleUser(user: User) {
    setBusy(true)
    try {
      await unwrap(api.setUserActive(user.id, !user.active))
      setUsers(await unwrap(api.listUsers()))
      push(user.active ? 'Usuário inativado' : 'Usuário ativado')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao atualizar usuário', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      push('A confirmação não confere com a nova senha', 'err')
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
      push('Senha alterada')
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao alterar senha', 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="settings-page">
      <div className="page-header">
        <p>
          {isAdmin
            ? 'Marca da empresa, usuários, cópia de segurança, aparência e atualizações'
            : 'Aparência e alteração de senha'}
        </p>
      </div>

      <div className="stack">
        <div className="panel" data-testid="settings-password">
          <h3>Alterar senha</h3>
          <p className="muted">A nova senha deve ter no mínimo 6 caracteres e ser diferente da atual.</p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="settings-current-password">Senha atual</label>
              <input
                id="settings-current-password"
                data-testid="input-settings-current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <div className="field">
              <label htmlFor="settings-new-password">Nova senha</label>
              <input
                id="settings-new-password"
                data-testid="input-settings-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label htmlFor="settings-confirm-password">Confirmar nova senha</label>
              <input
                id="settings-confirm-password"
                data-testid="input-settings-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="row-actions settings-actions">
            <button
              className="btn btn-primary"
              data-testid="btn-settings-change-password"
              disabled={busy}
              onClick={() => void handleChangePassword()}
            >
              Salvar senha
            </button>
          </div>
        </div>

        {isAdmin ? (
        <div className="panel" data-testid="settings-client-brand">
          <h3>Marca da empresa</h3>
          <p className="muted">
            A logo grande da sidebar é da empresa que usa o sistema. A Cortexis Tech permanece como desenvolvedora.
          </p>
          <div className="client-brand-editor">
            {clientLogo ? (
              <img src={clientLogo} alt="Logo da empresa" className="client-brand-preview" />
            ) : (
              <div className="client-brand-preview empty">Sem logo</div>
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
                  Salvar marca
                </button>
              </div>
            </div>
          </div>
        </div>
        ) : null}

        <div className="panel brand-panel" data-testid="settings-brand">
          <div className="brand-panel-inner">
            <img src={BRAND.logoSrc} alt={BRAND.company} className="brand-panel-logo" />
            <div className="brand-panel-copy">
              <span className="brand-eyebrow">{BRAND.productLine}</span>
              <h3>{BRAND.module}</h3>
              <p className="muted">
                {BRAND.fullName} ·{' '}
                <a className="link-accent" href={BRAND.website} target="_blank" rel="noreferrer">
                  {BRAND.websiteLabel}
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="panel" data-testid="settings-app-info">
          <h3>Aplicativo</h3>
          <p className="muted info-row">
            Versão: <strong data-testid="app-version">{version || '—'}</strong>
            {packaged ? ' · instalado' : ' · desenvolvimento'}
          </p>
          {isAdmin ? (
            <p className="muted info-row break-all">
              Banco de dados: <code data-testid="db-path">{dbPath || '—'}</code>
            </p>
          ) : null}
        </div>

        <div className="panel" data-testid="settings-license">
          <h3>Licença</h3>
          {licenseStatus?.active ? (
            <div className="license-details">
              <p className="muted info-row">Cliente: <strong>{licenseStatus.details.customer}</strong></p>
              <p className="muted info-row">Edição: <strong>{licenseStatus.details.edition === 'professional' ? 'Profissional' : 'Standard'}</strong></p>
              <p className="muted info-row">Validade: <strong>{licenseStatus.details.expiresAt ? new Date(licenseStatus.details.expiresAt).toLocaleDateString('pt-BR') : 'Perpétua'}</strong></p>
              <p className="muted info-row break-all">Identificação: <code>{licenseStatus.details.licenseId}</code></p>
            </div>
          ) : (
            <p className="muted">{licenseStatus?.reason ?? 'Consultando licença…'}</p>
          )}
        </div>

        {isAdmin ? (
        <div className="panel" data-testid="settings-users">
          <h3>Usuários</h3>
          <p className="muted">Cadastre administradores e operadores com acesso local.</p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="new-user-name">Nome</label>
              <input id="new-user-name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="new-user-username">Usuário</label>
              <input id="new-user-username" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="new-user-password">Senha</label>
              <input id="new-user-password" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="new-user-role">Perfil</label>
              <select id="new-user-role" value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'operador')}>
                <option value="operador">Operador</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>
          <div className="row-actions settings-actions">
            <button className="btn btn-primary" disabled={busy} onClick={() => void handleCreateUser()}>
              Cadastrar usuário
            </button>
          </div>
          <div className="table-wrap settings-table">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.username}</td>
                    <td>{roleLabel(u.role)}</td>
                    <td>{u.active ? 'Ativo' : 'Inativo'}</td>
                    <td>
                      <button className="btn btn-ghost" onClick={() => void handleToggleUser(u)}>
                        {u.active ? 'Inativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        ) : null}

        <div className="panel" data-testid="settings-appearance">
          <h3>Aparência</h3>
          <p className="muted">Escolha o tema da interface.</p>
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
        <div className="panel" data-testid="settings-backup">
          <h3>Cópia de segurança</h3>
          <p className="muted">
            Ao criar a cópia, você escolhe a pasta e o nome do arquivo `.db`.
            A restauração substitui todos os dados atuais.
          </p>
          <div className="row-actions">
            <button
              className="btn btn-primary"
              data-testid="btn-export-backup"
              disabled={busy}
              onClick={() => void handleExportBackup()}
            >
              Escolher local e salvar
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
              Última cópia salva em: <code>{lastBackupPath}</code>
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
