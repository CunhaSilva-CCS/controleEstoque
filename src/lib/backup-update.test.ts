import { beforeEach, describe, expect, it } from 'vitest'
import { api, unwrap } from './api'

const ADMIN_CHANGED_PASSWORD = 'Admin#test1'

async function ensureAdminUnlocked() {
  await unwrap(api.init())
  const withDefault = await api.login({ username: 'admin', password: 'admin123' })
  if (withDefault.ok) {
    if (withDefault.data.user?.mustChangePassword) {
      await unwrap(
        api.changePassword({
          currentPassword: 'admin123',
          newPassword: ADMIN_CHANGED_PASSWORD,
        }),
      )
    }
    return
  }
  await unwrap(api.login({ username: 'admin', password: ADMIN_CHANGED_PASSWORD }))
}

describe('backup e atualizações (API em memória)', () => {
  beforeEach(async () => {
    await ensureAdminUnlocked()
  })

  it('exporta e restaura backup', async () => {
    const exported = await unwrap(api.exportBackup())
    expect(exported.saved).toBe(true)
    expect(exported.path).toBeTruthy()

    const restored = await unwrap(api.restoreBackup())
    expect(restored.restored).toBe(true)
  })

  it('retorna info do app e status de update desabilitado no web', async () => {
    const info = await unwrap(api.getAppInfo())
    expect(info.version).toMatch(/1\.0\.0/)
    expect(info.packaged).toBe(false)
    expect(info.dbPath).toBe(':memory:')

    const status = await unwrap(api.getUpdateStatus())
    expect(status.state).toBe('disabled')

    const checked = await unwrap(api.checkForUpdates())
    expect(checked.state).toBe('disabled')

    const unsub = api.onUpdateStatus(() => undefined)
    expect(typeof unsub).toBe('function')
    unsub()
  })

  it('salva e recupera a marca da empresa contratante', async () => {
    const saved = await unwrap(
      api.saveClientBrand({
        name: 'Indústria Silva',
        logoDataUrl: 'data:image/png;base64,aaaa',
      }),
    )
    expect(saved.name).toBe('Indústria Silva')
    expect(saved.logoDataUrl).toMatch(/^data:image\/png/)

    const loaded = await unwrap(api.getClientBrand())
    expect(loaded.name).toBe('Indústria Silva')
  })
})
