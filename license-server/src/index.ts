import express from 'express'
import path from 'node:path'
import {
  ensureSchema,
  getRevocation,
  listIssuedLicenses,
  listRevocations,
  registerIssuedLicense,
  revokeLicense,
  unrevokeLicense,
} from './db'

const ADMIN_TOKEN = process.env.ADMIN_TOKEN
const PORT = Number(process.env.PORT) || 3000

const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'public')))

function requireAdmin(req: express.Request, res: express.Response): boolean {
  if (!ADMIN_TOKEN) {
    res.status(500).json({ error: 'ADMIN_TOKEN não configurado no servidor' })
    return false
  }
  const auth = req.header('authorization') ?? ''
  if (auth !== `Bearer ${ADMIN_TOKEN}`) {
    res.status(401).json({ error: 'Não autorizado' })
    return false
  }
  return true
}

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/auth/check', (req, res) => {
  if (!requireAdmin(req, res)) return
  res.json({ ok: true })
})

app.get('/licenses/:licenseId/status', async (req, res) => {
  try {
    const revocation = await getRevocation(req.params.licenseId)
    if (!revocation) {
      res.json({ licenseId: req.params.licenseId, revoked: false })
      return
    }
    res.json({ licenseId: req.params.licenseId, revoked: true, ...revocation })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro interno' })
  }
})

app.get('/licenses', async (req, res) => {
  if (!requireAdmin(req, res)) return
  try {
    const revocations = await listRevocations()
    res.json({ revocations })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro interno' })
  }
})

app.post('/licenses/:licenseId/revoke', async (req, res) => {
  if (!requireAdmin(req, res)) return
  try {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null
    const customer = typeof req.body?.customer === 'string' ? req.body.customer : null
    await revokeLicense(req.params.licenseId, reason, customer)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro interno' })
  }
})

app.post('/licenses/:licenseId/unrevoke', async (req, res) => {
  if (!requireAdmin(req, res)) return
  try {
    await unrevokeLicense(req.params.licenseId)
    res.json({ ok: true })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro interno' })
  }
})

app.post('/licenses/issued', async (req, res) => {
  if (!requireAdmin(req, res)) return
  try {
    const { licenseId, installationId, customer, edition, issuedAt, expiresAt } = req.body ?? {}
    if (typeof licenseId !== 'string' || !licenseId) throw new Error('licenseId é obrigatório')
    if (typeof installationId !== 'string' || !installationId) throw new Error('installationId é obrigatório')
    if (typeof customer !== 'string' || !customer) throw new Error('customer é obrigatório')
    if (typeof edition !== 'string' || !edition) throw new Error('edition é obrigatório')
    if (typeof issuedAt !== 'string' || Number.isNaN(Date.parse(issuedAt))) throw new Error('issuedAt inválido')
    if (expiresAt !== null && expiresAt !== undefined && Number.isNaN(Date.parse(expiresAt))) throw new Error('expiresAt inválido')
    await registerIssuedLicense({
      licenseId,
      installationId,
      customer,
      edition,
      issuedAt,
      expiresAt: expiresAt ?? null,
    })
    res.json({ ok: true })
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Erro interno' })
  }
})

app.get('/licenses/issued', async (req, res) => {
  if (!requireAdmin(req, res)) return
  try {
    const issued = await listIssuedLicenses()
    res.json({ issued })
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Erro interno' })
  }
})

ensureSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`license-server ouvindo na porta ${PORT}`)
    })
  })
  .catch((error) => {
    console.error('Falha ao preparar o esquema da base de dados', error)
    process.exit(1)
  })
