import { beforeEach, describe, expect, it } from 'vitest'
import { api, unwrap } from './api'

describe('backup e atualizações (API em memória)', () => {
  beforeEach(async () => {
    await unwrap(api.init())
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
})
