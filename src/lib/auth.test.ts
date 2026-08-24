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

describe('auth e permissões (API em memória)', () => {
  beforeEach(async () => {
    await unwrap(api.init())
  })

  it('exige troca da senha padrão no primeiro login', async () => {
    await unwrap(api.logout())
    const withDefault = await api.login({ username: 'admin', password: 'admin123' })
    if (!withDefault.ok) {
      const alreadyChanged = await unwrap(
        api.login({ username: 'admin', password: ADMIN_CHANGED_PASSWORD }),
      )
      expect(alreadyChanged.user?.mustChangePassword).toBe(false)
      return
    }

    expect(withDefault.data.user?.mustChangePassword).toBe(true)
    const blocked = await api.listUsers()
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error).toMatch(/palavra-passe/i)

    const short = await api.changePassword({
      currentPassword: 'admin123',
      newPassword: '123',
    })
    expect(short.ok).toBe(false)

    const same = await api.changePassword({
      currentPassword: 'admin123',
      newPassword: 'admin123',
    })
    expect(same.ok).toBe(false)

    const session = await unwrap(
      api.changePassword({
        currentPassword: 'admin123',
        newPassword: ADMIN_CHANGED_PASSWORD,
      }),
    )
    expect(session.user?.mustChangePassword).toBe(false)
    const users = await unwrap(api.listUsers())
    expect(users.some((u) => u.username === 'admin')).toBe(true)
  })

  it('operador não acessa usuários, backup, marca nem seed', async () => {
    await ensureAdminUnlocked()
    const username = `op-${crypto.randomUUID().slice(0, 6)}`
    await unwrap(
      api.createUser({
        name: 'Operador Teste',
        username,
        password: 'Operador#123',
        role: 'operador',
      }),
    )
    await unwrap(api.logout())
    const session = await unwrap(api.login({ username, password: 'Operador#123' }))
    expect(session.user?.role).toBe('operador')

    const users = await api.listUsers()
    expect(users.ok).toBe(false)

    const brand = await api.saveClientBrand({ name: 'Empresa X', logoDataUrl: '' })
    expect(brand.ok).toBe(false)

    const backup = await api.exportBackup()
    expect(backup.ok).toBe(false)

    const seed = await api.seed(false)
    expect(seed.ok).toBe(false)

    const updates = await api.checkForUpdates()
    expect(updates.ok).toBe(false)

    await unwrap(
      api.changePassword({
        currentPassword: 'Operador#123',
        newPassword: 'Operador#456',
      }),
    )
  })

  it('aplica complexidade, histórico e redefinição administrativa', async () => {
    await ensureAdminUnlocked()
    const username = `reset-${crypto.randomUUID().slice(0, 6)}`
    const created = await unwrap(api.createUser({
      name: 'Utilizador Reset',
      username,
      password: 'Temporaria#123',
      role: 'operador',
    }))
    expect(created.mustChangePassword).toBe(true)

    const weak = await api.resetUserPassword(created.id, 'semcomplexidade')
    expect(weak.ok).toBe(false)

    await unwrap(api.resetUserPassword(created.id, 'Temporaria#456'))
    await unwrap(api.logout())
    const session = await unwrap(api.login({ username, password: 'Temporaria#456' }))
    expect(session.user?.mustChangePassword).toBe(true)
    await unwrap(api.changePassword({ currentPassword: 'Temporaria#456', newPassword: 'Definitiva#789' }))

    const reused = await api.changePassword({
      currentPassword: 'Definitiva#789',
      newPassword: 'Temporaria#456',
    })
    expect(reused.ok).toBe(false)
    if (!reused.ok) expect(reused.error).toMatch(/últimas 5/i)
  })
})
