import fs from 'node:fs'
import path from 'node:path'
import { createPublicKey, randomUUID, sign, verify } from 'node:crypto'

function argument(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const customer = argument('customer')?.trim()
const edition = argument('edition') ?? 'standard'
const daysRaw = argument('days')
const output = argument('out')
const installationId = argument('installation')?.trim()
if (!customer) throw new Error('Informe --customer "Nome do cliente"')
if (!installationId) throw new Error('Informe --installation "Código exibido no computador do cliente"')
if (edition !== 'standard' && edition !== 'professional') throw new Error('--edition deve ser standard ou professional')
const days = daysRaw ? Number(daysRaw) : null
if (days !== null && (!Number.isInteger(days) || days < 1 || days > 3650)) throw new Error('--days deve estar entre 1 e 3650')

const privatePath = process.env.CORTEXIS_LICENSE_PRIVATE_KEY
if (!privatePath || !path.isAbsolute(privatePath) || !fs.existsSync(privatePath)) {
  throw new Error('Defina CORTEXIS_LICENSE_PRIVATE_KEY com o caminho absoluto da chave privada, fora deste projeto.')
}
const privateKey = fs.readFileSync(privatePath)
const publicPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString()
const embeddedPublicSource = fs.readFileSync(path.join(process.cwd(), 'shared', 'license-public-key.ts'), 'utf8')
if (!embeddedPublicSource.includes(JSON.stringify(publicPem))) {
  throw new Error('A chave privada não corresponde à chave pública incorporada no aplicativo')
}
const issuedAt = new Date()
const expiresAt = days === null ? null : new Date(issuedAt.getTime() + days * 86_400_000).toISOString()
const payload = {
  version: 1,
  licenseId: randomUUID(),
  installationId,
  customer,
  edition,
  issuedAt: issuedAt.toISOString(),
  expiresAt,
}
const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
const payloadBuffer = Buffer.from(JSON.stringify(payload))
const signatureBuffer = sign(null, payloadBuffer, privateKey)
if (!verify(null, payloadBuffer, publicPem, signatureBuffer)) throw new Error('Falha interna ao verificar a licença gerada')
const signature = signatureBuffer.toString('base64url')
const licenseKey = `CTX1-${encodedPayload}.${signature}`

if (output) {
  fs.writeFileSync(path.resolve(output), `${licenseKey}\n`, { encoding: 'utf8', mode: 0o600 })
  console.log(`Licença salva em ${path.resolve(output)}`)
} else {
  console.log(licenseKey)
}
console.error(`Cliente: ${customer} | Edição: ${edition} | Validade: ${expiresAt ?? 'perpétua'}`)
