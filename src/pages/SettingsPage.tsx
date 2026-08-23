import { useCallback, useEffect, useState } from 'react'
import { api, unwrap } from '../lib/api'
import { useToast } from '../lib/toast'
import type { UpdateStatus } from '@shared/types'

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
  const { push } = useToast()
  const [dbPath, setDbPath] = useState('')
  const [version, setVersion] = useState('')
  const [packaged, setPackaged] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [busy, setBusy] = useState(false)

  const loadInfo = useCallback(async () => {
    try {
      const info = await unwrap(api.getAppInfo())
      setDbPath(info.dbPath)
      setVersion(info.version)
      setPackaged(info.packaged)
      const status = await unwrap(api.getUpdateStatus())
      setUpdateStatus(status)
    } catch (err) {
      push(err instanceof Error ? err.message : 'Erro ao carregar informações', 'err')
    }
  }, [push])

  useEffect(() => {
    void loadInfo()
    const unsubscribe = api.onUpdateStatus((status) => setUpdateStatus(status))
    return unsubscribe
  }, [loadInfo])

  async function handleExportBackup() {
    setBusy(true)
    try {
      const result = await unwrap(api.exportBackup())
      if (result.saved) {
        push(result.path ? `Backup salvo em ${result.path}` : 'Backup exportado')
      } else {
        push('Exportação cancelada', 'err')
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao exportar backup', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function handleRestoreBackup() {
    setBusy(true)
    try {
      const result = await unwrap(api.restoreBackup())
      if (result.restored) {
        push('Backup restaurado com sucesso. Recarregando…')
        await loadInfo()
      } else {
        push('Restauração cancelada', 'err')
      }
    } catch (err) {
      push(err instanceof Error ? err.message : 'Falha ao restaurar backup', 'err')
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

  return (
    <div data-testid="settings-page">
      <div className="page-header">
        <div>
          <h2>Configurações</h2>
          <p>Backup, restauração e atualizações do aplicativo</p>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }} data-testid="settings-app-info">
        <h3 style={{ marginTop: 0 }}>Aplicativo</h3>
        <p className="muted" style={{ marginBottom: 8 }}>
          Versão: <strong data-testid="app-version">{version || '—'}</strong>
          {packaged ? ' · instalado' : ' · desenvolvimento / web'}
        </p>
        <p className="muted" style={{ marginBottom: 0, wordBreak: 'break-all' }}>
          Banco de dados: <code data-testid="db-path">{dbPath || '—'}</code>
        </p>
      </div>

      <div className="panel" style={{ marginBottom: 16 }} data-testid="settings-backup">
        <h3 style={{ marginTop: 0 }}>Backup e restauração</h3>
        <p className="muted">
          Exporte uma cópia segura do banco SQLite ou restaure a partir de um arquivo `.db`.
          A restauração substitui todos os dados atuais.
        </p>
        <div className="row-actions">
          <button
            className="btn btn-primary"
            data-testid="btn-export-backup"
            disabled={busy}
            onClick={() => void handleExportBackup()}
          >
            Exportar backup
          </button>
          <button
            className="btn btn-danger"
            data-testid="btn-restore-backup"
            disabled={busy}
            onClick={() => void handleRestoreBackup()}
          >
            Restaurar backup
          </button>
        </div>
      </div>

      <div className="panel" data-testid="settings-updates">
        <h3 style={{ marginTop: 0 }}>Atualizações</h3>
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
    </div>
  )
}
